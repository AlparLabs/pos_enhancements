from typing import Any
from odoo import api, models, fields


class PosCategory(models.Model):
    _inherit = 'pos.category'

    kitchen_sequence = fields.Integer(
        string='Kitchen Sequence',
        default=10,
        help="Used to order categories in the kitchen receipt. Lower numbers appear first."
    )

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        fields = super()._load_pos_data_fields(config)
        fields.append('kitchen_sequence')
        return fields
