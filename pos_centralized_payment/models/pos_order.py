from __future__ import annotations

from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    counter_salesperson_id = fields.Many2one(
        'hr.employee',
        string='Counter Salesperson',
        help=(
            'Employee who originally built the order at their own terminal '
            'before sending it to the centralized cashier for payment. Kept '
            'separate from the employee who validates the payment.'
        ),
    )
