# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    pos_shift_change_enabled = fields.Boolean(
        string='Allow Shift Change Close',
        default=False,
        help=(
            "When enabled, a 'Shift Change' button appears in the POS closing "
            "popup whenever draft (open table) orders exist. Open orders are "
            "transferred to a new session for the next shift instead of being "
            "cancelled. Only available for Bar/Restaurant POS configurations."
        ),
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        """Add pos_shift_change_enabled to the fields sent to the POS frontend."""
        fields_list = super()._load_pos_data_fields(config_id)
        if 'pos_shift_change_enabled' not in fields_list:
            fields_list.append('pos_shift_change_enabled')
        return fields_list
