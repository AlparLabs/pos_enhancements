/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { WaiterPopup } from "@pos_restaurant_waiter/app/waiter_popup/waiter_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    /**
     * @override
     * After setTableFromUi completes (which includes the guest count popup from
     * pos_restaurant_auto_guest_count), we open the waiter selection popup
     * for new, empty orders.
     */
    async setTableFromUi(table, orderUuid = null) {
        await super.setTableFromUi(...arguments);

        if (!this.config.module_pos_restaurant || !this.config.module_pos_hr) {
            return;
        }

        const order = this.get_order();
        // Only prompt for a new order without lines and without an assigned waiter.
        if (order && order.lines.length === 0 && !order.finalized && !order.waiter_id) {
            await this.askWaiter(order);
        }
    },

    /**
     * Opens the WaiterPopup and assigns the selected employee as the order's waiter.
     * @param {object} order - the current POS order
     */
    async askWaiter(order) {
        // Get all loaded employees — already in POS memory via pos_hr
        const employees = Object.values(this.models["hr.employee"].getAllBy("id"));

        if (!employees || employees.length === 0) {
            // No employees configured in this POS — silently skip.
            return;
        }

        const selectedEmployee = await makeAwaitable(this.dialog, WaiterPopup, {
            employees,
            title: _t("Who is serving this table?"),
        });

        if (selectedEmployee) {
            order.update({ waiter_id: selectedEmployee });
            // Persist the draft order so the waiter is saved immediately.
            if (typeof order.id === "number") {
                this.addPendingOrder([order.id]);
            }
        }
    },
});
