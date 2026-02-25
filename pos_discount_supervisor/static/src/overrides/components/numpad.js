/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Numpad } from "@point_of_sale/app/generic_components/numpad/numpad";

patch(Numpad.prototype, {
    async changeMode(mode) {
        if (mode === 'discount') {
            // Check if the current user has manager rights
            if (!this.env.services.pos.has_implied_group('point_of_sale.group_pos_manager')) {
                // If not, prompt for authorization
                const isManager = await this.env.services.pos.hasManagerRight();
                if (!isManager) {
                    // Manager failed to authorize, abort the mode change.
                    return;
                }
            }
        }

        // Otherwise, allow normal behavior (either they are already a manager or just got authorized, or changing to another mode)
        return super.changeMode(...arguments);
    }
});
