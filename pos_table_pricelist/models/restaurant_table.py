# -*- coding: utf-8 -*-

from odoo import api, fields, models


class RestaurantTable(models.Model):
    """Extend restaurant.table to support a per-table pricelist.

    When a cashier selects this table in the POS, the active pricelist
    will be switched to ``pos_pricelist_id`` automatically (if set).
    Tables without a pricelist use the POS session default.
    """

    _inherit = 'restaurant.table'

    pos_pricelist_id: int = fields.Many2one(
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
    def _load_pos_data_fields(self, config_id):
        """Extend the fields loaded for restaurant.table in the POS session.

        We add pos_pricelist_id so the POS frontend can read which
        pricelist each table should use.
        """
        fields_list = super()._load_pos_data_fields(config_id)
        if 'pos_pricelist_id' not in fields_list:
            fields_list.append('pos_pricelist_id')
        return fields_list
