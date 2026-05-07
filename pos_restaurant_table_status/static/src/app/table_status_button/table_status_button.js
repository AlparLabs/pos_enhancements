/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

export class TableStatusButton extends Component {
    static template = "pos_restaurant_table_status.TableStatusButton";
    static props = {};

    setup() {
        this.pos = usePos();
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    /**
     * Only visible inside a restaurant table order.
     */
    get isVisible() {
        return (
            this.pos.config.module_pos_restaurant &&
            Boolean(this.currentOrder?.table_id)
        );
    }

    /**
     * Returns true when the current order is marked as verified.
     */
    get isVerified() {
        return Boolean(this.currentOrder?.is_table_verified);
    }

    /**
     * Toggle the is_table_verified flag on the current order and persist it.
     */
    async click() {
        const order = this.currentOrder;
        if (!order) return;

        const newVal = !order.is_table_verified;
        order.update({ is_table_verified: newVal });

        // Persist the draft order immediately (same pattern as waiter assignment).
        if (typeof order.id === "number") {
            this.pos.addPendingOrder([order.id]);
        }
    }
}

// Register the component so the XML template can reference it inside ControlButtons.
Object.assign(ControlButtons.components, { TableStatusButton });
