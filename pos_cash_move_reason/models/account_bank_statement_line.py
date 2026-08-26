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
