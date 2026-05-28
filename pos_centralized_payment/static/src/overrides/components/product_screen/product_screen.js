/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PreTicketReceipt } from "@pos_retail_pre_ticket/app/receipt/pre_ticket_receipt";

/**
 * Returns true if the current cashier is allowed to access the payment screen.
 *
 * When `restrict_payment_to_manager` is disabled, all cashiers can pay (default Odoo behaviour).
 * When enabled, only employees with `_role === 'manager'` (set server-side by pos_hr based on
 * the advanced_employee_ids list) can see the Pay button.
 *
 * If no cashier is logged in, access is blocked as a safety measure.
 *
 * @param {Object} pos - POS service
 * @returns {boolean}
 */
function isCashierAllowedToPay(pos) {
    if (!pos.config.restrict_payment_to_manager) {
        return true;
    }
    const cashier = pos.getCashier();
    return cashier?._role === "manager";
}

patch(ProductScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.printer = useService("printer");
    },

    /**
     * Whether the current cashier can access the payment flow.
     * Used in the template to conditionally show/hide the Pay and Queue buttons.
     *
     * @returns {boolean}
     */
    get canPay() {
        return isCashierAllowedToPay(this.pos);
    },

    /**
     * Print a pre-ticket and park the order in the saved-orders queue.
     * Called by non-manager cashiers instead of the Pay button.
     *
     * @returns {Promise<void>}
     */
    async clickQueueOrder() {
        const order = this.pos.getOrder();
        if (!order || order.getOrderlines().length === 0) {
            return;
        }
        await this.printer.print(PreTicketReceipt, { order }, { webPrintFallback: true });
        this.pos.clickSaveOrder();
    },
});
