# -*- coding: utf-8 -*-

from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_table_timer = fields.Boolean(string="Enable Table Timer",
                                        help="Track table duration and compute total stay time in POS Restaurant.")


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_enable_table_timer = fields.Boolean(related='pos_config_id.enable_table_timer', string="Enable Table Timer",
                                            readonly=False)
