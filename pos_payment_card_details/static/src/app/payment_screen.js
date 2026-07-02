/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    /**
     * @param {Object} paymentMethod
     * @returns {Promise<any>}
     */
    async addNewPaymentLine(paymentMethod) {
        // Guard: skip if no valid payment method
        if (!paymentMethod || paymentMethod.is_category) return;

        // Call super FIRST so the payment line is fully created
        const result = await super.addNewPaymentLine(...arguments);

        // After super, show the popup if this payment method requires terminal details
        if (paymentMethod.use_terminal_details) {

            const order = this.currentOrder;
            const line =
                order.getSelectedPaymentline?.() ||
                order.payment_ids[order.payment_ids.length - 1];

            const terminalDetails = await makeAwaitable(this.dialog, TerminalDetailsPopup, {
                title: "Detalles de Terminal",
                startingValue: {
                    lot_number: "",
                    coupon_number: "",
                    installments: 1,
                }
            });

            if (!terminalDetails) {
                // User cancelled — remove the payment line we just added
                if (line) {
                    order.removePaymentline(line);
                }
                return;
            }

            // Update through the related-models API so the change is tracked
            // and serialized to the backend (pos.payment loads all fields in
            // v19, including these custom ones).
            if (line) {
                line.update({
                    lot_number: terminalDetails.lot_number,
                    coupon_number: terminalDetails.coupon_number,
                    installments: terminalDetails.installments,
                });
            }
        }

        return result;
    }
});