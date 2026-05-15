/** @odoo-module **/

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { useTrackedAsync } from "@point_of_sale/app/utils/hooks";

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

        // Fetch AR fiscal data (EMISOR, RECEPTOR, CAE, QR, etc.)
        try {
            const arData = await this.orm.call(
                "pos.order",
                "get_l10n_ar_receipt_data_by_move",
                [invoiceId]
            );
            if (arData) order.l10n_ar_data = arData;
        } catch (e) {
            console.warn("[concept_invoice] Could not fetch AR receipt data:", e);
        }

        // Fetch the concept invoice lines to replace the POS order lines.
        // The receipt must show the single concept line, not the original products.
        let conceptLines = null;
        try {
            const rawLines = await this.orm.call(
                "pos.order",
                "get_concept_invoice_receipt_lines",
                [invoiceId]
            );
            if (rawLines?.length) {
                const fmt = this.env.utils.formatCurrency;
                conceptLines = rawLines.map((l) => ({
                    ...l,
                    qty: String(l.qty % 1 === 0 ? l.qty.toFixed(2) : l.qty),
                    unitPrice: fmt(l.unitPrice),
                    price: fmt(l.price),
                    price_without_discount: fmt(l.price_without_discount),
                    discount: l.discount ? String(l.discount) : "",
                }));
            }
        } catch (e) {
            console.warn("[concept_invoice] Could not fetch concept invoice lines:", e);
        }

        const receiptData = this.pos.orderExportForPrinting(order);

        // Replace POS order lines with the concept invoice lines.
        if (conceptLines) {
            receiptData.orderlines = conceptLines;
        }

        await this.pos.printer.print(
            OrderReceipt,
            { data: receiptData, formatCurrency: this.env.utils.formatCurrency, basic_receipt: false },
            { webPrintFallback: true }
        );
    },
});
