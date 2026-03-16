/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        // Guard: skip if no valid payment method (e.g. category object or undefined)
        if (!paymentMethod || paymentMethod.is_category) return;

        // If this payment method requires terminal details, show the popup FIRST —
        // before calling super. Odoo's original addNewPaymentLine may auto-validate
        // the order (and close the payment screen) if the amount fully covers the
        // total, so any popup shown AFTER super would appear on an already-closed screen.
        let terminalDetails = null;
        if (paymentMethod.use_terminal_details) {
            terminalDetails = await makeAwaitable(this.env.services.dialog, TerminalDetailsPopup, {
                title: "Detalles de Terminal",
                startingValue: {
                    lot_number: "",
                    coupon_number: "",
                    installments: 1,
                }
            });
            // If the cashier cancelled the popup, abort adding the payment line entirely
            if (!terminalDetails) return;
        }

        const result = await super.addNewPaymentLine(...arguments);

        // Write the captured details onto the newly created payment line
        if (terminalDetails) {
            const line = this.currentOrder.selected_paymentline;
            if (line) {
                line.lot_number = terminalDetails.lot_number;
                line.coupon_number = terminalDetails.coupon_number;
                line.installments = terminalDetails.installments;
            }
        }

        return result;
    }
});
