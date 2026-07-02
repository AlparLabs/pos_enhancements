from typing import Any
from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    bar_ticket_paid_and_printed = fields.Boolean(
        string='Bar Ticket Printed',
        default=False,
        help=(
            'Set when the individual bar tickets for this line were printed at '
            'payment time. Prevents re-printing them without a supervisor PIN.'
        ),
    )

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        fields = super()._load_pos_data_fields(config)
        fields.append('bar_ticket_paid_and_printed')
        return fields
