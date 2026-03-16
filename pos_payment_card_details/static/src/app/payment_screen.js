/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        console.log("addNewPaymentLine called with:", paymentMethod);
        // Guard: skip if no valid payment method (e.g. category object or undefined)
        if (!paymentMethod || paymentMethod.is_category) {
            console.log("Skipping: is category or undefined");
            return;
        }

        console.log("use_terminal_details is:", paymentMethod.use_terminal_details);
        
        let terminalDetails = null;
        if (paymentMethod.use_terminal_details) {
            console.log("Attempting to open TerminalDetailsPopup");
            try {
                // Revert to this.dialog just in case that was correct all along
                terminalDetails = await makeAwaitable(this.dialog || this.env.services.dialog, TerminalDetailsPopup, {
                    title: "Detalles de Terminal",
                    startingValue: {
                        lot_number: "",
                        coupon_number: "",
                        installments: 1,
                    }
                });
                console.log("Popup closed, payload:", terminalDetails);
            } catch (err) {
                console.error("Error opening popup:", err);
            }
            if (!terminalDetails) {
                console.log("Popup cancelled, aborting payment line");
                return;
            }
        }

        console.log("Calling super.addNewPaymentLine");
        const result = await super.addNewPaymentLine(...arguments);

        if (terminalDetails) {
            const line = this.currentOrder.selected_paymentline;
            console.log("Payment line added:", line);
            if (line) {
                line.lot_number = terminalDetails.lot_number;
                line.coupon_number = terminalDetails.coupon_number;
                line.installments = terminalDetails.installments;
            }
        }

        return result;
    }
});
