/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { PreCuentaReceipt } from "@pos_restaurant_pre_cuenta/app/receipt/pre_cuenta_receipt";

export class PreCuentaButton extends Component {
    static template = "pos_restaurant_pre_cuenta.PreCuentaButton";
    static props = {
        buttonClass: { type: String, optional: true },
    };
    static defaultProps = {
        buttonClass: "btn btn-secondary btn-lg py-5",
    };

    setup() {
        this.pos = usePos();
        this.printer = useService("printer");
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

    /**
     * Print a pre-cuenta (non-fiscal bill) for the current table order.
     * @returns {Promise<void>}
     */
    async click() {
        const order = this.currentOrder;
        if (!order || order.getOrderlines().length === 0) {
            return;
        }
        await this.printer.print(PreCuentaReceipt, { order }, { webPrintFallback: true });

        // If pos_restaurant_table_status is installed, flag the table as
        // pre-cuenta printed so the floor screen shows the amber overlay.
        if (order.pre_cuenta_printed !== undefined) {
            order.update({ pre_cuenta_printed: true });
            if (typeof order.id === "number") {
                this.pos.addPendingOrder([order.id]);
            }
        }
    }
}

Object.assign(ControlButtons.components, { PreCuentaButton });
