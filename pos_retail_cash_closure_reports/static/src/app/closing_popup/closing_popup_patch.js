/** @odoo-module **/

import { ClosePosPopup } from "@point_of_sale/app/components/popups/closing_popup/closing_popup";
import { patch } from "@web/core/utils/patch";

patch(ClosePosPopup.prototype, {
    /**
     * Download the cash closure PDF (opening/expected/counted balance plus
     * the cash in/out movement detail for the session).
     * @returns {Promise<void>}
     */
    async downloadCashClosureReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_cash_closure",
            [this.pos.session.id]
        );
    },

    /**
     * Download the daily sales PDF, grouped by counter salesperson and
     * totaled per payment method.
     * @returns {Promise<void>}
     */
    async downloadSalesBySalespersonReport() {
        return this.report.doAction(
            "pos_retail_cash_closure_reports.action_report_sales_by_salesperson",
            [this.pos.session.id]
        );
    },
});
