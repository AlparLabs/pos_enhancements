/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        const result = await super.addNewPaymentLine(...arguments);
        
        // If the method requires terminal details, show popup
        if (result && paymentMethod.use_terminal_details) {
            const line = this.currentOrder.selected_paymentline;
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
            } else {
                // If cancelled, maybe we shouldn't have added the line?
                // Depending on requirements, we can keep it or delete it.
                // We'll keep it but without details.
            }
        }
        return result;
    }
});
