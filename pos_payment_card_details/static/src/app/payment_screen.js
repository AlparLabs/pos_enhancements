/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        // Guard: skip if no valid payment method (e.g. category object or undefined)
        if (!paymentMethod || paymentMethod.is_category) return;

        // Call super FIRST so the payment line is fully created (pos_order_id, etc.)
        const result = await super.addNewPaymentLine(...arguments);

        // After super, show the popup if this payment method requires terminal details
        if (paymentMethod.use_terminal_details) {
            const line = this.currentOrder.selected_paymentline;

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
                    this.currentOrder.remove_paymentline(line);
                }
                return;
            }

            // Write the captured details via update() so the reactive
            // Base model tracking will sync them to the backend.
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
