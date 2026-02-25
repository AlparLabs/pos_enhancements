/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";

patch(ProductScreen.prototype, {
    async onNumpadClick(buttonValue) {
        if (buttonValue === "discount") {
            // Check if the current user has manager rights
            if (!this.pos.has_implied_group('point_of_sale.group_pos_manager')) {
                // If not, prompt for authorization
                const isManager = await this.pos.hasManagerRight();
                if (!isManager) {
                    // Manager failed to authorize, abort the click.
                    return;
                }
            }
        }

        // Allow normal behavior
        return super.onNumpadClick(...arguments);
    }
});
