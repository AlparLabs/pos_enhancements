# -*- coding: utf-8 -*-
from typing import Any
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
    def _load_pos_data_fields(self, config_id: Any) -> list[str]:
        fields = super()._load_pos_data_fields(config_id)
        fields.append('waiter_id')
        return fields
