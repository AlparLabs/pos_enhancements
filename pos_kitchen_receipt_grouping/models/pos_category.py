from odoo import models, fields

class PosCategory(models.Model):
    _inherit = 'pos.category'

    kitchen_sequence = fields.Integer(
        string='Kitchen Sequence',
        default=10,
        help="Used to order categories in the kitchen receipt. Lower numbers appear first."
    )
