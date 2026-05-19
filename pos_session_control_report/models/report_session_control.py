from odoo import models


class ReportSessionControl(models.AbstractModel):
    _name = 'report.pos_session_control_report.report_session_control'
    _description = 'POS Session Control Report'

    def _get_report_values(self, docids, data=None):
        sessions = self.env['pos.session'].browse(docids)
        sale_details = self.env['report.point_of_sale.report_saledetails'].get_sale_details(
            session_ids=list(docids)
        )
        return {
            'docs': sessions,
            'currency': sessions[0].currency_id if sessions else self.env.company.currency_id,
            **sale_details,
        }
