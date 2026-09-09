# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_nps_survey_enabled = fields.Boolean(
        string='NPS Survey QR on Receipt',
        related='pos_config_id.nps_survey_enabled',
        readonly=False,
    )
    pos_nps_survey_on_pre_cuenta = fields.Boolean(
        string='Imprimir en Pre-Cuenta',
        related='pos_config_id.nps_survey_on_pre_cuenta',
        readonly=False,
    )
    pos_nps_survey_url = fields.Char(
        string='NPS Survey URL',
        related='pos_config_id.nps_survey_url',
        readonly=False,
    )
    pos_nps_receipt_title = fields.Char(
        string='Receipt NPS Title',
        related='pos_config_id.nps_receipt_title',
        readonly=False,
    )
    pos_nps_receipt_subtitle = fields.Char(
        string='Receipt NPS Subtitle',
        related='pos_config_id.nps_receipt_subtitle',
        readonly=False,
    )
