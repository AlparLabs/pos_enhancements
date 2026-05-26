/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

export class TableStatusButton extends Component {
    static template = "pos_restaurant_table_status.TableStatusButton";
    static props = {};

    setup() {
        this.pos = usePos();
    }

    get currentOrder() {
        return this.pos.getOrder();
    }

    get isVisible() {
        return (
            this.pos.config.module_pos_restaurant &&
            Boolean(this.currentOrder?.table_id)
        );
    }

    get isVerified() {
        return Boolean(this.currentOrder?.is_table_verified);
    }

    async click() {
        const order = this.currentOrder;
        if (!order) return;

        const newVal = !order.is_table_verified;
        order.update({ is_table_verified: newVal });

        if (typeof order.id === "number") {
            this.pos.addPendingOrder([order.id]);
        }
    }
}

Object.assign(ControlButtons.components, { TableStatusButton });
