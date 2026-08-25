from typing import Any

from odoo import api, fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    kitchen_group_id = fields.Many2one(
        'pos.kitchen.group',
        string='Kitchen Group',
        ondelete='set null',
        help="Overrides the kitchen group of the POS category for this product only. "
             "Leave empty to follow the category.",
    )

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        res = super()._load_pos_data_fields(config)
        res.append('kitchen_group_id')
        return res
