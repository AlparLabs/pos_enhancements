/** @odoo-module **/

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
        this.invoiceService = useService("account_move");
    },

    get isConceptInvoiceDisabled() {
        const order = this.currentOrder;
        // Disable if there's no order, or no lines, or it's already invoiced
        return !order || order.lines.length === 0 || order.account_move || order.is_to_invoice();
    },

    async clickConceptInvoice() {
        if (this.isConceptInvoiceDisabled) return;

        const order = this.currentOrder;

        this.dialog.add(ConceptInvoicePopup, {
            order: order,
            onConfirm: async ({ concept, partnerId }) => {
                try {
                    // Call backend to generate concept invoice
                    const result = await this.orm.call(
                        "pos.order",
                        "create_concept_invoice",
                        [order.uuid, concept, partnerId || false]
                    );

                    this.notification.add(
                        `✓ Factura ${result.invoice_name} generada correctamente`,
                        { type: "success", sticky: false }
                    );

                    // Update UI state so the invoice is linked and we don't allow duplicates
                    order.account_move = result.invoice_id;
                    order.set_to_invoice(true);

                    // Download PDF
                    if (result.invoice_id) {
                        await this.invoiceService.downloadPdf(result.invoice_id);
                    }

                } catch (error) {
                    this.notification.add(
                        error?.data?.message || "Error al generar la factura concepto.",
                        { type: "danger", sticky: true }
                    );
                }
            },
        });
    }
});
