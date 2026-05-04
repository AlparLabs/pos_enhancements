/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { WaiterPopup } from "@pos_restaurant_waiter/app/waiter_popup/waiter_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

patch(ControlButtons.prototype, {
    /**
     * Opens the WaiterPopup to change the waiter for the current order.
     * Visible only when a table order is active.
     */
    async clickChangeWaiter() {
        const order = this.pos.get_order();
        if (!order) return;

        const employees = Object.values(
            this.pos.models["hr.employee"].getAllBy("id")
        );

        if (!employees || employees.length === 0) return;

        const selectedEmployee = await makeAwaitable(this.dialog, WaiterPopup, {
            employees,
            title: _t("Change Waiter"),
            currentWaiter: order.waiter_id || null,
        });

        if (selectedEmployee !== undefined) {
            // null means "clear", an employee record means "assign"
            order.update({ waiter_id: selectedEmployee });
            if (typeof order.id === "number") {
                this.pos.addPendingOrder([order.id]);
            }
        }
    },

    get currentWaiterName() {
        return this.pos.get_order()?.waiter_id?.name || null;
    },
});
