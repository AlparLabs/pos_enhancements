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
    def _load_pos_data_read(self, records, config) -> list[dict]:
        """Include restrict_payment_to_manager in the POS session data.

        pos.config fields are NOT loaded via _load_pos_data_fields (the base mixin returns []
        and Odoo core adds extra fields directly in its own _load_pos_data_read override).
        We follow the same pattern to avoid restricting the DB read and breaking other fields
        like currency_id.
        """
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['restrict_payment_to_manager'] = config.restrict_payment_to_manager
        return read_records
