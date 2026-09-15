# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_refund_to_scrap = fields.Boolean(
        related='pos_config_id.refund_to_scrap',
        readonly=False,
    )
    pos_refund_scrap_mode = fields.Selection(
        related='pos_config_id.refund_scrap_mode',
        readonly=False,
    )
    pos_refund_scrap_location_id = fields.Many2one(
        related='pos_config_id.refund_scrap_location_id',
        readonly=False,
    )
