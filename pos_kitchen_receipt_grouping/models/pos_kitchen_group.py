from typing import Any

from odoo import api, fields, models


class PosKitchenGroup(models.Model):
    _name = 'pos.kitchen.group'
    _description = 'POS Kitchen Group'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, id'

    name = fields.Char(string='Name', required=True, translate=True)
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
        # Son pocos registros y el ticket puede necesitar cualquiera de ellos
        # (un producto puede pisar el grupo de su categoría), así que se cargan
        # todos sin filtrar por las categorías habilitadas en el POS.
        return []

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        return ['id', 'name', 'sequence']
