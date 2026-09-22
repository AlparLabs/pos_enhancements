# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    pos_delivery_customer_details = fields.Boolean(
        string='Datos de Entrega en Comprobantes',
        default=False,
        help=(
            "Cuando está activo, imprime los datos completos del cliente (Nombre, Dirección, "
            "Localidad, CP, Teléfono y Correo) en comandas de cocina, tickets de venta y facturas."
        ),
    )

    @api.model
    def _load_pos_data_read(self, records, config):
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['pos_delivery_customer_details'] = config.pos_delivery_customer_details
        return read_records
