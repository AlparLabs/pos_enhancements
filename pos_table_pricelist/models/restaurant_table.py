# -*- coding: utf-8 -*-
from typing import Any
from odoo import api, fields, models


class RestaurantTable(models.Model):
    _inherit = 'restaurant.table'

    pos_pricelist_id = fields.Many2one(
        comodel_name='product.pricelist',
        string='Lista de precios POS',
        help=(
            "Si se asigna una lista de precios, el POS cambiará automáticamente "
            "a ella cuando se seleccione esta mesa. "
            "Dejar vacío para usar la lista de precios predeterminada del POS."
        ),
        ondelete='set null',
    )

    @api.model
    def _load_pos_data_fields(self, config_id: Any) -> list[str]:
        fields_list = super()._load_pos_data_fields(config_id)
        if 'pos_pricelist_id' not in fields_list:
            fields_list.append('pos_pricelist_id')
        return fields_list
