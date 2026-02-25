/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";

patch(ControlButtons.prototype, {
    async clickDiscount() {
        // First check if the user is a POS manager
        if (this.pos.has_implied_group('point_of_sale.group_pos_manager')) {
            return super.clickDiscount(...arguments);
        }

        // If not a manager, prompt for manager authorization
        const isManager = await this.pos.hasManagerRight();
        if (isManager) {
            // Once authorized, we can call the original behavior
            return super.clickDiscount(...arguments);
        }
    }
});
