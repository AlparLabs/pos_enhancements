/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { WaiterPopup } from "@pos_restaurant_waiter/app/waiter_popup/waiter_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

export class ChangeWaiterButton extends Component {
    static template = "pos_restaurant_waiter.ChangeWaiterButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get currentWaiterName() {
        return this.currentOrder?.waiter_id?.name || null;
    }

    /**
     * Only show when pos_restaurant + pos_hr are active and a table is assigned.
     */
    get isVisible() {
        return (
            this.pos.config.module_pos_restaurant &&
            this.pos.config.module_pos_hr &&
            Boolean(this.currentOrder?.table_id)
        );
    }

    async click() {
        const order = this.currentOrder;
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

        // selectedEmployee === null  → user pressed Skip (clear waiter)
        // selectedEmployee === undefined → dialog closed without action
        if (selectedEmployee !== undefined) {
            order.update({ waiter_id: selectedEmployee });
            if (typeof order.id === "number") {
                this.pos.addPendingOrder([order.id]);
            }
        }
    }
}

// Inject our component into ControlButtons so the XML can reference it
Object.assign(ControlButtons.components, { ChangeWaiterButton });
