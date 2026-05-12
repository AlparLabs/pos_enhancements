/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";

/**
 * ConceptInvoiceButton
 *
 * Renders a "Factura Concepto" button inside the POS PaymentScreen.
 * On click, opens ConceptInvoicePopup to collect concept + partner,
 * then calls pos.order.create_concept_invoice on the backend.
 */
export class ConceptInvoiceButton extends Component {
    static template = "pos_concept_invoice.ConceptInvoiceButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    /** Disable the button when there's no order or it has no lines. */
    get isDisabled() {
        const order = this.currentOrder;
        // .lines is the authoritative array; get_orderlines() just returns it
        return !order || order.lines.length === 0;
    }

    async click() {
        if (this.isDisabled) return;

        const order = this.currentOrder;

        this.dialog.add(ConceptInvoicePopup, {
            order: order,
            onConfirm: async ({ concept, partnerId }) => {
                try {
                    // Ensure the order is saved to the server before calling
                    // the backend — the uuid lookup requires a server-side record.
                    await this.pos.syncAllOrders();

                    // Pass uuid — draft orders use a uuid string, not an integer id
                    const result = await this.orm.call(
                        "pos.order",
                        "create_concept_invoice",
                        [order.uuid, concept, partnerId || false]
                    );
                    this.notification.add(
                        `✓ Factura ${result.invoice_name} generada correctamente`,
                        { type: "success", sticky: false }
                    );
                } catch (error) {
                    this.notification.add(
                        error?.data?.message || "Error al generar la factura concepto.",
                        { type: "danger", sticky: true }
                    );
                }
            },
        });
    }
}

// PaymentScreenButtons is a sub-template rendered via t-call inside PaymentScreen.
// Components referenced inside it must be registered on the PaymentScreen class.
Object.assign(PaymentScreen.components, { ConceptInvoiceButton });
