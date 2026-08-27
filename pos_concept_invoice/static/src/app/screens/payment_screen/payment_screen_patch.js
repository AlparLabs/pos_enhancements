/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";
import { ConceptInvoicePopup } from "@pos_concept_invoice/app/concept_invoice_popup/concept_invoice_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

patch(PaymentScreen.prototype, {
    async toggleIsToInvoice() {
        if (!this.pos.config.canInvoice) {
            this.notification.add(
                _t("To enable invoice creation, please add a journal for it in the settings."),
                { type: "warning" }
            );
            return;
        }

        const currentChoice = this.currentOrder.concept_invoice_name
            ? "concept"
            : this.currentOrder.isToInvoice()
            ? "standard"
            : "none";

        const selected = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Seleccionar tipo de comprobante"),
            list: [
                {
                    id: "standard",
                    label: _t("Factura Estándar (Detalle de productos)"),
                    item: "standard",
                    isSelected: currentChoice === "standard",
                },
                {
                    id: "concept",
                    label: _t("Factura por Concepto (Línea única personalizada)"),
                    item: "concept",
                    isSelected: currentChoice === "concept",
                },
                {
                    id: "none",
                    label: _t("Sin Factura (Ticket Simple)"),
                    item: "none",
                    isSelected: currentChoice === "none",
                },
            ],
        });

        if (!selected) {
            return;
        }

        if (selected === "standard") {
            this.currentOrder.setToInvoice(true);
            this.currentOrder.concept_invoice_name = "";
            if (!this.currentOrder.getPartner()) {
                await this.pos.selectPartner();
            }
        } else if (selected === "concept") {
            const payload = await makeAwaitable(this.dialog, ConceptInvoicePopup, {
                order: this.currentOrder,
            });
            if (payload && payload.concept) {
                this.currentOrder.setToInvoice(true);
                this.currentOrder.concept_invoice_name = payload.concept;
                if (payload.partnerId) {
                    const partner = this.pos.models["res.partner"]?.get(payload.partnerId);
                    if (partner) {
                        this.currentOrder.partner_id = partner;
                        this.currentOrder.updatePricelistAndFiscalPosition?.(partner);
                    }
                }
            }
        } else if (selected === "none") {
            this.currentOrder.setToInvoice(false);
            this.currentOrder.concept_invoice_name = "";
        }
    },
});
