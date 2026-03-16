/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        // Guard: skip if no valid payment method (e.g. category object or undefined)
        if (!paymentMethod || paymentMethod.is_category) return;

        const result = await super.addNewPaymentLine(...arguments);
        
        // If the method requires terminal details, show popup.
        // Note: Odoo's addNewPaymentLine returns undefined, so we check
        // for the existence of selected_paymentline instead of trusting `result`.
        const line = this.currentOrder.selected_paymentline;
        if (paymentMethod.use_terminal_details && line) {
            const payload = await makeAwaitable(this.dialog, TerminalDetailsPopup, {
                title: "Detalles de Terminal",
                startingValue: {
                    lot_number: line.lot_number || "",
                    coupon_number: line.coupon_number || "",
                    installments: line.installments || 1,
                }
            });

            if (payload) {
                line.lot_number = payload.lot_number;
                line.coupon_number = payload.coupon_number;
                line.installments = payload.installments;
            }
        }
        return result;
    }
});
