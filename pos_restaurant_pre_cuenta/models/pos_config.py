# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    pre_cuenta_show_tip = fields.Boolean(
        string='Mostrar propina sugerida en Pre-Cuenta',
        default=True,
        help='Muestra sugerencias de propina calculadas sobre el total en la pre-cuenta de restaurante.',
    )
    pre_cuenta_tip_percentages = fields.Char(
        string='Porcentajes de propina sugeridos',
        default='10, 15, 20',
        help='Valores de porcentajes sugeridos separados por coma (ej. 10, 15, 20).',
    )

    @api.model
    def _load_pos_data_read(self, records, config):
        """Include pre-cuenta tip configuration in POS session frontend data."""
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['pre_cuenta_show_tip'] = config.pre_cuenta_show_tip
            read_records[0]['pre_cuenta_tip_percentages'] = config.pre_cuenta_tip_percentages
        return read_records
