/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useTrackedAsync } from "@point_of_sale/app/utils/hooks";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: fetch AFIP data from server for a given order
// ─────────────────────────────────────────────────────────────────────────────
async function fetchArData(orm, posReference) {
    return await orm.call("pos.order", "get_l10n_ar_receipt_data", [posReference]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch 1: PaymentScreen.afterOrderValidation
//
// In Odoo 18 the full flow is:
//   validateOrder()
//     └─ _finalizeValidation()
//          ├─ syncAllOrders()          ← invoice created here
//          └─ afterOrderValidation()   ← printReceipt() + navigate here
//
// We intercept here so the invoice already exists when we fetch AR data,
// store it on the order, and let the original method print the receipt.
// ─────────────────────────────────────────────────────────────────────────────
patch(PaymentScreen.prototype, {
    async afterOrderValidation(hasOrderChange) {
        const order = this.currentOrder;

        if (order && order.is_to_invoice() && order.pos_reference) {
            try {
                const data = await fetchArData(
                    this.env.services.orm,
                    order.pos_reference
                );
                if (data) {
                    order.l10n_ar_data = data;
                }
            } catch (e) {
                console.warn("Could not fetch AFIP receipt data:", e);
            }
        }

        return await super.afterOrderValidation(hasOrderChange);
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patch 2: PosOrder.export_for_printing
//
// Merge l10n_ar_data (set by Patch 1) into the receipt data object that
// printReceipt() passes to the OrderReceipt OWL component.
// ─────────────────────────────────────────────────────────────────────────────
patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(...arguments);

        if (this.l10n_ar_data) {
            Object.assign(result, this.l10n_ar_data);
        }

        return result;
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patch 3: ReceiptScreen — add "Imprimir Factura" button
//
// Adds a setup hook that registers `doPrintArInvoice` (a useTrackedAsync so
// the button shows a spinner while loading), which fetches fresh AR data and
// prints via the hardware receipt printer.
// ─────────────────────────────────────────────────────────────────────────────
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();

        // useTrackedAsync gives the button the same loading/success/error
        // states as the core "Print Full Receipt" button.
        this.doPrintArInvoice = useTrackedAsync(
            this._printArInvoiceReceipt.bind(this)
        );
    },

    /**
     * Fetch fresh AFIP data and print the receipt enriched with invoice details.
     * This is the handler for the "Imprimir Factura" button on the ReceiptScreen.
     */
    async _printArInvoiceReceipt() {
        const order = this.currentOrder;
        if (!order) {
            return;
        }

        // Fetch fresh AR data (covers the case where afterOrderValidation
        // was called offline, or the user navigated back to the screen).
        try {
            const data = await fetchArData(
                this.env.services.orm,
                order.pos_reference
            );
            if (data) {
                order.l10n_ar_data = data;
            }
        } catch (e) {
            console.warn("Could not fetch AFIP receipt data for manual print:", e);
        }

        // Build receipt data — export_for_printing (patched above) merges
        // l10n_ar_data automatically.
        const receiptData = this.pos.orderExportForPrinting(order);

        // Print through the receipt printer (same service used by printReceipt).
        await this.pos.printer.print(
            OrderReceipt,
            {
                data: receiptData,
                formatCurrency: this.env.utils.formatCurrency,
                basic_receipt: false,
            },
            { webPrintFallback: true }
        );
    },
});
