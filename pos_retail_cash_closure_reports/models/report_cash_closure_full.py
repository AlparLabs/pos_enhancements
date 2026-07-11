from odoo import models


class ReportCashClosureFull(models.AbstractModel):
    # Table-name length must stay within Postgres's 63-char identifier
    # limit: report_pos_retail_cash_closure_reports_cash_closure_full is
    # 56 chars — verified before naming this model (see commit history for
    # the sales_by_salesperson report, which hit this exact limit).
    _name = 'report.pos_retail_cash_closure_reports.cash_closure_full'
    _description = 'POS Retail Cash Closure Report (Combined)'

    def _get_report_values(self, docids: list, data: dict | None = None) -> dict:
        cash_values = self.env[
            'report.pos_retail_cash_closure_reports.report_cash_closure'
        ]._get_report_values(docids, data)
        sales_values = self.env[
            'report.pos_retail_cash_closure_reports.sales_by_salesperson'
        ]._get_report_values(docids, data)
        # docs/currency_id/formatLang are present and equivalent in both
        # dicts; sales_values only adds groups/grand_total on top, so a
        # plain merge is safe — no meaningful key collisions.
        return {**cash_values, **sales_values}
