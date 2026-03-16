/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { TerminalDetailsPopup } from "@pos_payment_card_details/app/popups/terminal_details_popup/terminal_details_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        if (!paymentMethod || paymentMethod.is_category) {
            return;
        }

        let terminalDetails = null;
        if (paymentMethod.use_terminal_details) {
            // makeAwaitable seems to fail silently in this version.
            // In Odoo 18, dialog.add() natively returns a Promise that 
            // resolves when the dialog is closed.
            try {
                // To get a payload back from a standard dialog, we pass a callback
                await new Promise((resolve) => {
                    this.env.services.dialog.add(TerminalDetailsPopup, {
                        title: "Detalles de Terminal",
                        startingValue: {
                            lot_number: "",
                            coupon_number: "",
                            installments: 1,
                        },
                        getPayload: (payload) => {
                            terminalDetails = payload;
                        },
                        close: () => {
                            // Dialog's close method will be injected, we just resolve our promise
                            resolve();
                        }
                    }, {
                        onClose: () => resolve() // fallback if closed by other means
                    });
                });
            } catch (err) {
                console.error("Error opening popup:", err);
            }

            if (!terminalDetails) {
                // Cashier cancelled or closed the modal
                return;
            }
        }

        const result = await super.addNewPaymentLine(...arguments);

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
