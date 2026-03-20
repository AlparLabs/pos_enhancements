/* @odoo-module */

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { ActionpadWidget } from "@point_of_sale/app/screens/product_screen/action_pad/action_pad";
import { getNow, toServerDatetime } from "./utils/time_utils";

function ensureStartTime(order, pos) {
    if (!order.start_time && pos.config.enable_table_timer) {
        order.start_time = toServerDatetime(getNow());
    }
}

patch(ProductScreen.prototype, {
    async submitOrder() {
        ensureStartTime(this.currentOrder, this.pos);
        await super.submitOrder(...arguments);
    },
});

patch(ActionpadWidget.prototype, {
    async submitOrder() {
        ensureStartTime(this.currentOrder, this.pos);
        await super.submitOrder(...arguments);
    },
});
