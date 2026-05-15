/** @odoo-module **/

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
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

                // Open PDF in a new tab — separate from invoice creation so a
                // download failure never triggers the error notification above.
                if (result.invoice_id) {
                    window.open(
                        `/report/pdf/account.report_invoice/${result.invoice_id}`,
                        "_blank"
                    );
                }
            },
        });
    }
});
