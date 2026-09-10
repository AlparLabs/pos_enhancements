# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    nps_survey_enabled = fields.Boolean(
        string='NPS Survey QR on Receipt',
        default=False,
        help='When enabled, a QR code for customer satisfaction / NPS survey is printed on the receipt.',
    )
    nps_survey_on_pre_cuenta = fields.Boolean(
        string='Imprimir en Pre-Cuenta',
        default=False,
        help='Incluye el código QR de encuesta NPS también en el comprobante de pre-cuenta de restaurante.',
    )
    nps_survey_url = fields.Char(
        string='NPS Survey URL',
        help='The URL or link for the customer survey (e.g. Google Forms, Typeform, Research tool, etc.).',
    )
    nps_receipt_title = fields.Char(
        string='Receipt NPS Title',
        default='¿Cómo fue tu experiencia?',
        help='Title or header text displayed above the survey QR code on the receipt.',
    )
    nps_receipt_subtitle = fields.Char(
        string='Receipt NPS Subtitle',
        default='Escaneá el código QR y dejanos tu opinión.',
        help='Subtitle or instructions displayed below the survey QR code on the receipt.',
    )

    @api.model
    def _load_pos_data_read(self, records, config):
        """Include NPS survey fields in the POS session frontend data."""
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['nps_survey_enabled'] = config.nps_survey_enabled
            read_records[0]['nps_survey_on_pre_cuenta'] = config.nps_survey_on_pre_cuenta
            read_records[0]['nps_survey_url'] = config.nps_survey_url
            read_records[0]['nps_receipt_title'] = config.nps_receipt_title
            read_records[0]['nps_receipt_subtitle'] = config.nps_receipt_subtitle
        return read_records
