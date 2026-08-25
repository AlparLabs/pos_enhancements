from typing import Any

from odoo import api, fields, models


class PosKitchenGroup(models.Model):
    _name = 'pos.kitchen.group'
    _description = 'POS Kitchen Group'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, id'

    name = fields.Char(string='Name', required=True)
    sequence = fields.Integer(
        string='Sequence',
        default=10,
        help="Orders the blocks on the kitchen receipt. Lower numbers print first.",
    )
    category_ids = fields.One2many(
        'pos.category',
        'kitchen_group_id',
        string='POS Categories',
    )

    _name_uniq = models.Constraint(
        'unique (name)',
        'A kitchen group with this name already exists.',
    )

    @api.model
    def _load_pos_data_domain(self, data: Any, config: Any) -> list:
        # Few records, and the receipt may need any of them (a product can
        # override its category's group), so they are all loaded without
        # filtering by the categories enabled on the POS.
        return []

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        return ['id', 'name', 'sequence']
