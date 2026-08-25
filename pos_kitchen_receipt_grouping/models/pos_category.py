from typing import Any
from odoo import api, models, fields


class PosCategory(models.Model):
    _inherit = 'pos.category'

    kitchen_group_id = fields.Many2one(
        'pos.kitchen.group',
        string='Kitchen Group',
        ondelete='set null',
        help="Block this category is printed under on the kitchen receipt. "
             "When empty, the category name is used as the block.",
    )

    kitchen_sequence = fields.Integer(
        string='Kitchen Sequence',
        default=10,
        help="Orders the lines of this category inside its kitchen receipt block. "
             "Lower numbers appear first."
    )

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        res = super()._load_pos_data_fields(config)
        res += ['kitchen_sequence', 'kitchen_group_id']
        return res
