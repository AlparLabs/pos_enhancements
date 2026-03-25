/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
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

            // CORRECCIÓN: Obtener la línea de forma segura en Odoo 18
            const order = this.currentOrder;
            const line = order.get_selected_paymentline?.() || order.payment_ids[order.payment_ids.length - 1];

            const terminalDetails = await makeAwaitable(this.env.services.dialog, TerminalDetailsPopup, {
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
                    order.remove_paymentline(line);
                }
                return;
            }

            // Set the captured details directly on the object.
            if (line) {
                line.lot_number = terminalDetails.lot_number;
                line.coupon_number = terminalDetails.coupon_number;
                line.installments = terminalDetails.installments;
            }
        }

        return result;
    }
});