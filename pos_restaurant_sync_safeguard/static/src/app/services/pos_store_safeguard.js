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
        return result;
    },

    /**
     * Surgical hook on printOrderChanges (called for each printer inside printChanges).
     * Enforces a 3.5s timeout on the physical thermal printer printReceipt call.
     * If a printer is offline, jammed, or socket hangs, it returns a compliant
     * { successful: false, message: { body: ... } } object instead of throwing or hanging.
     */
    async printOrderChanges(data, printer) {
        const printerName = printer.config?.name || printer.name || _t("Comandera");
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(`Timeout de 3.5s en impresora '${printerName}'`));
            }, 3500);
        });

        try {
            const result = await Promise.race([super.printOrderChanges(data, printer), timeoutPromise]);
            return result;
        } catch (err) {
            console.warn(`[pos_restaurant_sync_safeguard] Fallo o timeout al imprimir en '${printerName}':`, err);
            this.notification?.add(
                _t("Aviso: No se pudo imprimir en '%s' (demora de red o desconexión). La comanda se registró.", printerName),
                { type: "warning", sticky: true }
            );
            return {
                successful: false,
                message: { body: _t("Impresora desconectada o sin respuesta (timeout 3.5s)") },
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
     * Wraps all printers (unwatched.printers, printers, and receipt printer)
     * with an asynchronous timeout (3500ms) as an extra layer of defense.
     */
    _wrapPrintersWithSafeguard() {
        const printerList = [];
        if (Array.isArray(this.unwatched?.printers)) {
            printerList.push(...this.unwatched.printers);
        }
        if (Array.isArray(this.printers)) {
            printerList.push(...this.printers);
        }
        if (this.unwatched?.printer && typeof this.unwatched.printer === "object") {
            printerList.push(this.unwatched.printer);
        }
        if (this.printer && typeof this.printer === "object") {
            printerList.push(this.printer);
        }

        for (const printer of printerList) {
            if (!printer || printer._safeguardWrapped) {
                continue;
            }
            printer._safeguardWrapped = true;
            const printerName = printer.config?.name || printer.name || _t("Comandera");

            if (typeof printer.printReceipt === "function") {
                const origPrintReceipt = printer.printReceipt.bind(printer);
                printer.printReceipt = async (...args) => {
                    return this._executeWithTimeout(origPrintReceipt, args, printerName, 3500);
                };
            }

            if (typeof printer.print === "function") {
                const origPrint = printer.print.bind(printer);
                printer.print = async (...args) => {
                    return this._executeWithTimeout(origPrint, args, printerName, 3500);
                };
            }

            if (typeof printer.sendPrintingJob === "function") {
                const origSendJob = printer.sendPrintingJob.bind(printer);
                printer.sendPrintingJob = async (...args) => {
                    return this._executeWithTimeout(origSendJob, args, printerName, 3500);
                };
            }
        }
    },

    async _executeWithTimeout(fn, args, printerName, ms = 3500) {
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
                message: { body: _t("Impresora desconectada o sin respuesta (timeout 3.5s)") },
            };
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    },
});
