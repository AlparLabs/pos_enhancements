# -*- coding: utf-8 -*-
from odoo import models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def _load_pos_data_fields(self, config_id):
        result = super()._load_pos_data_fields(config_id)
        # Expose pre_cuenta_printed so the floor screen can read it.
        # The field is declared in pos_restaurant_table_status; this ensures
        # it is included in the POS data payload whenever pos_restaurant_pre_cuenta
        # is installed alongside that module.
        if 'pre_cuenta_printed' not in result:
            result += ['pre_cuenta_printed']
        return result
