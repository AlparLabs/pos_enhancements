from __future__ import annotations

from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    restrict_payment_to_manager: bool = fields.Boolean(
        string='Centralized Payment',
        default=False,
        help=(
            'When enabled, the Pay button is only visible to cashiers with the Manager role. '
            'Designed for multi-terminal setups with a single centralized cash register.'
        ),
    )

    @api.model
    def _load_pos_data_fields(self, config_id: int) -> list[str]:
        return super()._load_pos_data_fields(config_id) + ['restrict_payment_to_manager']
