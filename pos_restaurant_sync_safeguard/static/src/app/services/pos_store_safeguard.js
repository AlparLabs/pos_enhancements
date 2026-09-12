/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    setup() {
        super.setup(...arguments);
        this._orderSyncingTimestamps = {};
        this._wrapPrintersWithSafeguard();
    },

    async afterProcessServerData() {
        const result = await super.afterProcessServerData(...arguments);
        this._wrapPrintersWithSafeguard();
        if (this.config.module_pos_restaurant && (!this.currentFloor || !this.currentFloor.active)) {
            const activeFloor =
                this.config.floor_ids?.find?.((f) => f.active) ||
                this.config.floor_ids?.[0] ||
                this.models?.["restaurant.floor"]?.getFirst?.();
            if (activeFloor) {
                this.currentFloor = activeFloor;
            }
        }
        return result;
    },

    /**
     * Preserves and synchronizes currentFloor when navigating tables.
     * Core Odoo 19 never updates currentFloor when entering a table, leaving it
     * vulnerable to becoming null or disconnected during server synchronization.
     */
    async setTable(table, orderUuid = null) {
        if (table?.floor_id) {
            const floor =
                typeof table.floor_id === "object"
                    ? table.floor_id
                    : this.models?.["restaurant.floor"]?.get?.(table.floor_id);
            if (floor) {
                this.currentFloor = floor;
            }
        }
        return await super.setTable(...arguments);
    },

    async setTableFromUi(table, orderUuid = null) {
        if (table?.floor_id) {
            const floor =
                typeof table.floor_id === "object"
                    ? table.floor_id
                    : this.models?.["restaurant.floor"]?.get?.(table.floor_id);
            if (floor) {
                this.currentFloor = floor;
            }
        }
        return await super.setTableFromUi(...arguments);
    },

    async unsetTable() {
        const table = this.selectedTable;
        if (table?.floor_id) {
            const floor =
                typeof table.floor_id === "object"
                    ? table.floor_id
                    : this.models?.["restaurant.floor"]?.get?.(table.floor_id);
            if (floor) {
                this.currentFloor = floor;
            }
        }
        return await super.unsetTable(...arguments);
    },

    /**
     * Surgical hook on printOrderChanges (called for each printer inside printChanges).
     * Enforces an 8.5s timeout on preparation printers (IoT Box / network thermal printers).
     * 8.5s ensures normal Raspberry Pi IoT rasterization and multi-ticket queues (e.g. Cocina + Barra
     * on the same physical IoT Box) complete without false alarms, while safely intercepting truly
     * disconnected or offline printers before browser hangs occur.
     */
    async printOrderChanges(data, printer) {
        const printerName = printer.config?.name || printer.name || _t("Comandera");
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`Timeout de 8.5s en impresora '${printerName}'`));
            }, 8500);
        });

        try {
            const result = await Promise.race([super.printOrderChanges(data, printer), timeoutPromise]);
            return result;
        } catch (err) {
            console.warn(`[pos_restaurant_sync_safeguard] Fallo o timeout (>8.5s) al imprimir en '${printerName}':`, err);
            this.notification?.add(
                _t("Aviso: Demora o desconexión en impresora '%s'. La comanda se registró en el sistema.", printerName),
                { type: "warning", sticky: true }
            );
            return {
                successful: false,
                message: { body: _t("Impresora sin respuesta o con demora excesiva (timeout 8.5s)") },
            };
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    },

    /**
     * Intercepts sendOrderInPreparation to:
     * 1. Track syncingOrders timestamps to detect and auto-heal zombie locks.
     * 2. CRITICAL FIX FOR ODOO 19 CORE: Core only syncs to backend if isPrinted is true
     *    (line 2048: if (isPrinted && ...)). If a printer failed, core skips syncAllOrders,
     *    leaving the order stranded locally and invisible to other terminals. We guarantee
     *    syncAllOrders({ orders: [order], force: true }) always runs.
     * 3. Guarantees in finally that order.uuid is removed from syncingOrders and UI locks are cleared.
     */
    async sendOrderInPreparation(order, opts = {}) {
        this._wrapPrintersWithSafeguard();
        if (order?.uuid) {
            this._orderSyncingTimestamps = this._orderSyncingTimestamps || {};
            this._orderSyncingTimestamps[order.uuid] = Date.now();
        }

        try {
            const res = await super.sendOrderInPreparation(...arguments);

            // Respaldo de sincronización: asegurar que la orden siempre viaje al backend
            // aún si alguna o todas las impresoras térmicas fallaron
            if (order && !order.finalized && !this.models["pos.prep.display"]?.length) {
                try {
                    await this.syncAllOrders({ orders: [order], force: true });
                } catch (syncErr) {
                    console.warn("[pos_restaurant_sync_safeguard] syncAllOrders post-comanda:", syncErr);
                }
            }

            return res;
        } catch (err) {
            console.error("[pos_restaurant_sync_safeguard] Error en sendOrderInPreparation:", err);
            this.notification?.add(
                _t("Hubo una demora al enviar la comanda. La mesa se mantendrá desbloqueada."),
                { type: "warning", sticky: true }
            );

            // Intento de rescate: persistir la orden en el servidor
            if (order && !order.finalized) {
                try {
                    await this.syncAllOrders({ orders: [order], force: true });
                } catch (rescueErr) {
                    console.warn("[pos_restaurant_sync_safeguard] Rescate de sincronización falló:", rescueErr);
                }
            }

            return false;
        } finally {
            if (order?.uuid) {
                this.syncingOrders?.delete(order.uuid);
                delete this._orderSyncingTimestamps?.[order.uuid];
            }
            this._clearOrderUiLocks(order);
        }
    },

    /**
     * Auto-heals stale syncingOrders locks (>10 seconds) so users are never
     * permanently locked out of a table saying "This order is currently syncing".
     */
    isOrderSyncing(order, notify = true) {
        if (order?.uuid && this.syncingOrders?.has(order.uuid)) {
            const lockTime = this._orderSyncingTimestamps?.[order.uuid];
            if (lockTime && Date.now() - lockTime > 10000) {
                console.warn(`[pos_restaurant_sync_safeguard] Auto-liberando lock zombie de sincronización para orden ${order.uuid}`);
                this.syncingOrders.delete(order.uuid);
                delete this._orderSyncingTimestamps[order.uuid];
                return false;
            }
        }
        return super.isOrderSyncing(...arguments);
    },

    /**
     * Clears all known UI lock and submitting flags on the order object.
     */
    _clearOrderUiLocks(order) {
        if (!order) return;
        if (order.uiState) {
            order.uiState.isSubmitting = false;
            order.uiState.isSending = false;
            order.uiState.syncing = false;
        }
        order._isSending = false;
        order._isSyncing = false;
        order.syncing = false;
    },

    /**
     * Extra layer of defense: wraps stand-alone receipt printers (outside of printOrderChanges)
     * with an 8.5s timeout so customer receipt prints never hang the terminal indefinitely.
     */
    _wrapPrintersWithSafeguard() {
        const targetPrinters = [];
        if (this.printer?.device && typeof this.printer.device === "object") {
            targetPrinters.push(this.printer.device);
        }
        if (this.hardwareProxy?.printer && typeof this.hardwareProxy.printer === "object") {
            targetPrinters.push(this.hardwareProxy.printer);
        }

        for (const printer of targetPrinters) {
            if (!printer || printer._safeguardWrapped) {
                continue;
            }
            printer._safeguardWrapped = true;
            const printerName = printer.config?.name || printer.name || _t("Impresora de Recibos");

            if (typeof printer.printReceipt === "function") {
                const origPrintReceipt = printer.printReceipt.bind(printer);
                printer.printReceipt = async (...args) => {
                    return this._executeWithTimeout(origPrintReceipt, args, printerName, 8500);
                };
            }
        }
    },

    async _executeWithTimeout(fn, args, printerName, ms = 8500) {
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`Timeout de ${ms}ms en impresora '${printerName}'`));
            }, ms);
        });

        try {
            const result = await Promise.race([fn(...args), timeoutPromise]);
            return result;
        } catch (err) {
            console.warn(`[pos_restaurant_sync_safeguard] Falla de impresión en '${printerName}':`, err);
            this.notification?.add(
                _t("No se pudo imprimir en '%s' (demora o desconexión). La orden se registró pero verifique el ticket.", printerName),
                { type: "warning", sticky: true }
            );
            return {
                successful: false,
                message: { body: _t("Impresora desconectada o sin respuesta (timeout 8.5s)") },
            };
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    },
});
