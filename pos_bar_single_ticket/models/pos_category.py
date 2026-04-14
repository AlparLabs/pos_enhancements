from typing import Any
from odoo import api, fields, models


class PosCategory(models.Model):
    _inherit = 'pos.category'

    x_print_single_ticket = fields.Boolean(
        string='Print Single Ticket',
        default=False,
        help=(
            'If checked, each unit of product in this category will be printed '
            'on a separate ticket when sending the order to the kitchen/bar printer.'
        ),
    )

    @api.model
    def _load_pos_data_fields(self, config_id: Any) -> list[str]:
        fields = super()._load_pos_data_fields(config_id)
        fields.append('x_print_single_ticket')
        return fields
