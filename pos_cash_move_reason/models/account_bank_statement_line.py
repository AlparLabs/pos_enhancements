from odoo import fields, models


class AccountBankStatementLine(models.Model):
    _inherit = 'account.bank.statement.line'

    pos_cash_move_reason_id = fields.Many2one(
        'pos.cash.move.reason',
        string='POS Cash Move Concept',
        index=True,
        ondelete='restrict',
        readonly=True,
        help='Concept button the cashier used in the POS cash in/out popup. Kept even when '
             'two concepts share the same account, so movements stay distinguishable.',
    )
    pos_counterpart_partner_id = fields.Many2one(
        'res.partner',
        string='POS Counterpart Contact',
        ondelete='restrict',
        readonly=True,
        help="Contact written on the counterpart journal item. Distinct from the statement "
             "line's partner, which POS uses for the cashier.",
    )

    def _prepare_move_line_default_vals(self, counterpart_account_id=None):
        vals_list = super()._prepare_move_line_default_vals(counterpart_account_id)
        # vals_list[0] is the liquidity (cash) line, vals_list[1] the counterpart.
        # Core copies the statement line's partner to both, and in POS that partner is
        # the cashier. Overwriting only the counterpart keeps both traces: who took the
        # money out, and who it was paid to.
        if self.pos_counterpart_partner_id and len(vals_list) > 1:
            vals_list[1]['partner_id'] = self.pos_counterpart_partner_id.id
        return vals_list
