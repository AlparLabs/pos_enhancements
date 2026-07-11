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

        # Every account.bank.statement.line tied to the session is shown, with
        # no exclusion — this matches Odoo core's own get_sale_details(),
        # which does not filter out the auto-generated closing-difference
        # line either (it only has a distinctive payment_ref, e.g. "Cash
        # difference observed during the counting (Loss/Profit) - closing").
        # A prior version of this file dropped the chronologically-last move
        # whenever session.cash_register_difference was truthy, believing it
        # mirrored a core exclusion that does not actually exist.
        # cash_register_difference is a live-computed field (counted amount
        # vs. theoretical expected amount) that is virtually always non-zero
        # while a session is still open, so that logic silently discarded the
        # most recent real cash movement on every open session. Do not
        # reintroduce a "drop the last move" heuristic without first
        # confirming, against the actual Odoo source for the target version,
        # that core performs an equivalent exclusion and exactly what
        # condition it checks.
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
