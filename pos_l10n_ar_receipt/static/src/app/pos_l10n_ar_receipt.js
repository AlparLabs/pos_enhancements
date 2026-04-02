/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useTrackedAsync } from "@point_of_sale/app/utils/hooks";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: fetch AFIP data from server.
//
// Strategy: use order.raw.account_move (the invoice ID already populated after
// sync) if available — this is the most direct and timing-safe approach.
// Falls back to searching by pos_reference if the raw id isn't there yet.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchArData(orm, order) {
    let invoiceId = order.raw?.account_move;
    if (Array.isArray(invoiceId)) {
        invoiceId = invoiceId[0];
    }

    if (invoiceId) {
        // Preferred path: read directly from the account.move we already know.
        console.log("[l10n_ar_receipt] Fetching AFIP data for invoice id:", invoiceId);
        const data = await orm.call(
            "pos.order",
            "get_l10n_ar_receipt_data_by_move",
            [invoiceId]
        );
        console.log("[l10n_ar_receipt] Received AR data:", data);
        return data;
    }

    // Fallback: search by pos_reference (used from ReceiptScreen button on
    // past orders where raw.account_move might not be in memory).
    if (order.pos_reference) {
        console.log("[l10n_ar_receipt] Fetching AFIP data by pos_reference:", order.pos_reference);
        const data = await orm.call(
            "pos.order",
            "get_l10n_ar_receipt_data",
            [order.pos_reference]
        );
        console.log("[l10n_ar_receipt] Received AR data (fallback):", data);
        return data;
    }

    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch 1: PaymentScreen.afterOrderValidation
//
// In Odoo 18 the full flow is:
//   validateOrder()
//     └─ _finalizeValidation()
//          ├─ syncAllOrders()          ← invoice created, raw.account_move set
//          └─ afterOrderValidation()   ← printReceipt() + navigate here
//
// By the time afterOrderValidation runs, order.raw.account_move is already
// populated by the sync response, so fetchArData can use it directly.
// ─────────────────────────────────────────────────────────────────────────────
patch(PaymentScreen.prototype, {
    async afterOrderValidation(hasOrderChange) {
        const order = this.currentOrder;

        if (order && order.is_to_invoice()) {
            try {
                const data = await fetchArData(this.env.services.orm, order);
                if (data) {
                    order.l10n_ar_data = data;
                } else {
                    console.warn("[l10n_ar_receipt] No AR data returned (invoice may not have CAE yet)");
                }
            } catch (e) {
                console.warn("[l10n_ar_receipt] Could not fetch AFIP receipt data:", e);
            }
        }

        return await super.afterOrderValidation(hasOrderChange);
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// Patch 2: PosOrder.export_for_printing
//
// Merge l10n_ar_data into the receipt data object that printReceipt() passes
// to the OrderReceipt OWL component. Called for both auto-print and manual print.
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
// Patch 3: ReceiptScreen — "Imprimir Factura" button
//
// Fetches fresh AR data on demand (guarantees the AFIP CAE is already populated,
// since the user clicks the button after witnessing the receipt screen).
// ─────────────────────────────────────────────────────────────────────────────
patch(ReceiptScreen.prototype, {
    setup() {
        super.setup();
        this.doPrintArInvoice = useTrackedAsync(
            this._printArInvoiceReceipt.bind(this)
        );
    },

    async _printArInvoiceReceipt() {
        const order = this.currentOrder;
        if (!order) {
            return;
        }

        try {
            const data = await fetchArData(this.env.services.orm, order);
            if (data) {
                order.l10n_ar_data = data;
            }
        } catch (e) {
            console.warn("[l10n_ar_receipt] Could not fetch AFIP receipt data for manual print:", e);
        }

        const receiptData = this.pos.orderExportForPrinting(order);

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
