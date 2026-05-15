/** @odoo-module **/

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";
import { patch } from "@web/core/utils/patch";
import { useService, useTrackedAsync } from "@web/core/utils/hooks";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
        this.doConceptPrint = useTrackedAsync(this._printConceptInvoiceReceipt.bind(this));
    },

    get isConceptInvoiceDisabled() {
        const order = this.currentOrder;
        return !order || order.lines.length === 0 || order.account_move || order.is_to_invoice();
    },

    async clickConceptInvoice() {
        if (this.isConceptInvoiceDisabled) return;

        const order = this.currentOrder;

        this.dialog.add(ConceptInvoicePopup, {
            order: order,
            onConfirm: async ({ concept, partnerId }) => {
                let result;
                try {
                    result = await this.orm.call(
                        "pos.order",
                        "create_concept_invoice",
                        [order.uuid, concept, partnerId || false]
                    );
                } catch (error) {
                    this.notification.add(
                        error?.data?.message || "Error al generar la factura concepto.",
                        { type: "danger", sticky: true }
                    );
                    return;
                }

                this.notification.add(
                    `✓ Factura ${result.invoice_name} generada correctamente`,
                    { type: "success", sticky: false }
                );

                order.account_move = result.invoice_id;
            },
        });
    },

    async _printConceptInvoiceReceipt() {
        const order = this.currentOrder;
        const invoiceId = order?.account_move;
        if (!invoiceId) return;

        try {
            const data = await this.orm.call(
                "pos.order",
                "get_l10n_ar_receipt_data_by_move",
                [invoiceId]
            );
            if (data) order.l10n_ar_data = data;
        } catch (e) {
            console.warn("[concept_invoice] Could not fetch AR receipt data:", e);
        }

        const receiptData = this.pos.orderExportForPrinting(order);
        await this.pos.printer.print(
            OrderReceipt,
            { data: receiptData, formatCurrency: this.env.utils.formatCurrency, basic_receipt: false },
            { webPrintFallback: true }
        );
    },
});
