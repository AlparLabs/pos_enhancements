/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    setup() {
        super.setup(...arguments);
        this._wrapPrintersWithSafeguard();
    },

    async afterProcessServerData() {
        const result = await super.afterProcessServerData(...arguments);
        this._wrapPrintersWithSafeguard();
        return result;
    },

    /**
     * Intercepts sendOrderInPreparation to:
     * 1. Ensure printers have safeguard timeouts active before printing.
     * 2. Wrap execution so any unexpected promise rejection does not freeze the UI.
     * 3. Clear all UI/order lock flags in finally so the table is never permanently stuck in "syncing".
     */
    async sendOrderInPreparation(order, opts = {}) {
        this._wrapPrintersWithSafeguard();
        try {
            return await super.sendOrderInPreparation(...arguments);
        } catch (err) {
            console.error("[pos_restaurant_sync_safeguard] Error en sendOrderInPreparation:", err);
            this.notification?.add(
                _t("Hubo una demora al enviar la comanda. La mesa se mantendrá desbloqueada."),
                { type: "warning", sticky: true }
            );
            return false;
        } finally {
            this._clearOrderUiLocks(order);
        }
    },

    /**
     * Wrap printChanges with error boundary to ensure that even if standard printer
     * dispatch encounters an unhandled error, the function resolves safely without
     * aborting order.updateLastOrderChange() and server synchronization.
     */
    async printChanges(order, orderChange, reprint) {
        this._wrapPrintersWithSafeguard();
        try {
            return await super.printChanges(...arguments);
        } catch (err) {
            console.warn("[pos_restaurant_sync_safeguard] Error controlado en printChanges:", err);
            this.notification?.add(
                _t("Aviso: Una o más comanderas no respondieron. La orden continúa su registro."),
                { type: "warning", sticky: true }
            );
            return false;
        }
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
     * Wraps all printers (kitchen/preparation printers and receipt printer)
     * with an asynchronous timeout (3500ms).
     *
     * In restaurant setups, network thermal printers on the local LAN can
     * hang or drop connection due to microcuts, paper shortages, or buffer lockups.
     * Capping the timeout prevents the POS JavaScript thread from freezing or
     * aborting backend synchronization.
     */
    _wrapPrintersWithSafeguard() {
        const printerList = [];
        if (Array.isArray(this.printers)) {
            printerList.push(...this.printers);
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
            return false;
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
    },
});
