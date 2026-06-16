/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

function isManagerCashier(pos) {
    if (!pos.config.module_pos_hr) {
        return true;
    }
    return pos.get_cashier()?._role === "manager";
}

patch(ControlButtons.prototype, {
    setup() {
        super.setup(...arguments);
        this.orm = useService("orm");
    },

    get canCancelOrder() {
        return isManagerCashier(this.pos);
    },

    async clickCancelOrder() {
        const order = this.pos.get_order();
        if (!order) {
            return;
        }
        // Capture server ID before deletion — the order object is removed from
        // POS state during onDeleteOrder but the JS object stays in memory.
        const orderId = typeof order.id === "number" ? order.id : null;
        const employeeId = this.pos.get_cashier()?.id ?? null;

        // onDeleteOrder returns truthy when deletion completed (falsy/undefined
        // when user cancels the confirmation dialog). RPC is best-effort only.
        const deleted = await this.pos.onDeleteOrder(order);

        // Fire-and-forget audit log. Only runs for orders already synced to the
        // backend (orderId is a number). Silently skipped if offline.
        if (deleted && orderId && employeeId) {
            this.orm
                .call("pos.order", "log_cancel_supervisor", [[orderId], employeeId])
                .catch(() => {});
        }
    },
});
