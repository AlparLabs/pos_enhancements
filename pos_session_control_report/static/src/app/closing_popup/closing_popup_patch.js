/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    /**
     * Download the slim session-control PDF (payments + discounts + cash control).
     * Reuses the same report service that is already set up in ClosePosPopup.setup().
     * @returns {Promise<void>}
     */
    async downloadSessionControlReport() {
        return this.report.doAction(
            "pos_session_control_report.action_report_session_control",
            [this.pos.session.id]
        );
    },
});
