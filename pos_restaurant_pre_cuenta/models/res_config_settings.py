# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_pre_cuenta_show_tip = fields.Boolean(
        string='Sugerencia de propina en Pre-Cuenta',
        related='pos_config_id.pre_cuenta_show_tip',
        readonly=False,
    )
    pos_pre_cuenta_tip_percentages = fields.Char(
        string='Porcentajes sugeridos de propina',
        related='pos_config_id.pre_cuenta_tip_percentages',
        readonly=False,
    )
