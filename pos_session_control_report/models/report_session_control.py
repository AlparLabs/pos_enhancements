from odoo import models
from odoo.tools.misc import formatLang as _format_lang


class ReportSessionControl(models.AbstractModel):
    _name = 'report.pos_session_control_report.report_session_control'
    _description = 'POS Session Control Report'

    def _get_report_values(self, docids, data=None):
        sessions = self.env['pos.session'].browse(docids)
        sale_details = self.env['report.point_of_sale.report_saledetails'].get_sale_details(
            session_ids=list(docids)
        )
        env = self.env
        # NOTE: sale_details already contains a 'currency' key which is a plain dict
        # (symbol, position, total_paid, precision). We pass the actual res.currency
        # recordset under 'currency_id' so formatLang receives a proper recordset with
        # the .decimal_places attribute it needs.
        currency_id = sessions[0].currency_id if sessions else self.env.company.currency_id
        return {
            'docs': sessions,
            'currency_id': currency_id,
            # formatLang must be passed explicitly — it is NOT auto-injected in custom reports.
            'formatLang': lambda amount, **kwargs: _format_lang(env, amount, **kwargs),
            **sale_details,
        }
