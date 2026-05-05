# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    waiter_id = fields.Many2one(
        'hr.employee',
        string='Waiter',
        help='The employee serving this table.',
        index=True,
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        params = super()._load_pos_data_fields(config_id)
        if 'waiter_id' not in params:
            params.append('waiter_id')
        return params
