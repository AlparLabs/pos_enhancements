/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    /**
     * Download the combined "Cierre de Caja" PDF: cash balance summary plus
     * cash in/out movement detail, followed by the day's sales grouped by
     * counter salesperson and totaled per payment method.
     * @returns {Promise<void>}
     */
    async downloadCashClosureReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_cash_closure_full",
            [this.pos.session.id]
        );
    },
});
