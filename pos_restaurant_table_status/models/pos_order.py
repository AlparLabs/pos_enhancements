from odoo import models, fields


class PosOrder(models.Model):
    _inherit = 'pos.order'

    is_table_verified = fields.Boolean(
        string='Table Verified',
        help='Set by the waiter to mark this table as checked / verified.',
    )

    pre_cuenta_printed = fields.Boolean(
        string='Pre-Cuenta Printed',
        help='Set automatically when the Pre-Cuenta is printed for this order.',
    )

