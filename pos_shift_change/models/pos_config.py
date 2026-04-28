# -*- coding: utf-8 -*-
from odoo import fields, models


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
