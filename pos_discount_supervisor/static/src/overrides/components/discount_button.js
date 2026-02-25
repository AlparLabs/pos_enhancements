/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { DiscountButton } from "@pos_discount/app/discount_button/discount_button";

patch(DiscountButton.prototype, {
    async onClick() {
        // If the user has manager rights, just proceed
        if (this.pos.has_implied_group('point_of_sale.group_pos_manager')) {
            return super.onClick(...arguments);
        }

        // If not a manager, prompt for manager authorization
        const isManager = await this.pos.hasManagerRight();
        if (isManager) {
            // Once authorized, we can call the original onClick behavior
            return super.onClick(...arguments);
        }
    }
});
