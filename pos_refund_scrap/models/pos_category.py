# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosCategory(models.Model):
    _inherit = 'pos.category'

    scrap_on_refund = fields.Boolean(
        string='Desechar en reembolso (Merma)',
        default=False,
        help='Si est? marcado, los reembolsos de productos pertenecientes a esta categor?a se enviar?n a la ubicaci?n de merma/desperdicio en lugar de reingresar al stock.',
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if 'scrap_on_refund' not in fields_list:
            fields_list.append('scrap_on_refund')
        return fields_list
