/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { WaiterPopup } from "@pos_restaurant_waiter/app/waiter_popup/waiter_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    /**
     * Expose the assigned waiter to the preparation (kitchen) receipt data,
     * so the OrderChangeReceipt header can print "Mozo: <name>".
     */
    getOrderData(order, reprint) {
        const data = super.getOrderData(...arguments);
        data.waiter_name = order.waiter_id?.name || "";
        return data;
    },

    /**
     * @override
     * After setTableFromUi completes (which includes the guest count popup from
     * pos_restaurant_auto_guest_count), open the waiter selection popup for new
     * empty orders.
     */
    async setTableFromUi(table, orderUuid = null) {
        await super.setTableFromUi(...arguments);

        if (!this.config.module_pos_restaurant || !this.config.module_pos_hr) {
            return;
        }

        const order = this.getOrder();
        if (order && order.lines.length === 0 && !order.finalized && !order.waiter_id) {
            await this.askWaiter(order);
        }
    },

    async askWaiter(order) {
        const employees = this.models["hr.employee"]?.getAll() ?? [];
        if (!employees.length) return;

        const selectedEmployee = await makeAwaitable(this.dialog, WaiterPopup, {
            employees,
            title: _t("Who is serving this table?"),
        });

        if (selectedEmployee) {
            order.update({ waiter_id: selectedEmployee });
            if (typeof order.id === "number") {
                this.addPendingOrder([order.id]);
            }
        }
    },
});
