/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";

patch(TicketScreen.prototype, {
    shouldHideDeleteButton(order) {
        if (super.shouldHideDeleteButton(order)) {
            return true;
        }
        if (!this.pos.config.module_pos_hr) {
            return false;
        }
        return this.pos.get_cashier()?._role !== "manager";
    },
});
