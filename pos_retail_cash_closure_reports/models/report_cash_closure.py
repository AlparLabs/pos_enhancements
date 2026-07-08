from odoo import models
from odoo.tools.misc import format_datetime as _format_datetime
from odoo.tools.misc import formatLang as _format_lang


class ReportCashClosure(models.AbstractModel):
    _name = 'report.pos_retail_cash_closure_reports.report_cash_closure'
    _description = 'POS Retail Cash Closure Report'

    def _get_report_values(self, docids: list, data: dict | None = None) -> dict:
        env = self.env
        sessions = env['pos.session'].browse(docids)
        sale_details = env['report.point_of_sale.report_saledetails'].get_sale_details(
            session_ids=list(docids)
        )
        currency_id = sessions[0].currency_id if sessions else env.company.currency_id

        # Only payment methods with cash control enabled (get_sale_details()
        # sets 'count' truthy for those) belong in the balance summary.
        cash_payments = [
            payment for payment in sale_details.get('payments', [])
            if payment.get('count')
        ]

        moves = env['account.bank.statement.line'].search([
            ('pos_session_id', 'in', sessions.ids),
        ], order='date asc, id asc')

        cash_moves = [
            {
                'date': _format_datetime(env, move.create_date),
                'type': 'Ingreso' if move.amount > 0 else 'Retiro',
                'reason': move.payment_ref,
                'amount': abs(move.amount),
            }
            for move in moves
        ]
        total_cash_in = sum(move.amount for move in moves if move.amount > 0)
        total_cash_out = sum(-move.amount for move in moves if move.amount < 0)

        return {
            'docs': sessions,
            'currency_id': currency_id,
            # formatLang must be passed explicitly — it is NOT auto-injected in custom reports.
            'formatLang': lambda amount, **kwargs: _format_lang(env, amount, **kwargs),
            'cash_payments': cash_payments,
            'cash_moves': cash_moves,
            'total_cash_in': total_cash_in,
            'total_cash_out': total_cash_out,
            **sale_details,
        }
