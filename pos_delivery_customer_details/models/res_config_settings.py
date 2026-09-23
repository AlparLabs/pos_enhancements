# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_delivery_customer_details = fields.Boolean(
        string='Datos de Entrega en Comprobantes',
        related='pos_config_id.pos_delivery_customer_details',
        readonly=False,
    )
