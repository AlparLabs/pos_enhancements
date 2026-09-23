# -*- coding: utf-8 -*-
from odoo import api, models


class ResPartner(models.Model):
    _inherit = 'res.partner'

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        for field_name in ('street2', 'phone', 'email', 'zip', 'city', 'state_id'):
            if field_name in self._fields and field_name not in fields_list:
                fields_list.append(field_name)
        return fields_list
