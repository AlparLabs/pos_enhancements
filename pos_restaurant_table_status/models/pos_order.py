# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    is_table_verified = fields.Boolean(
        string='Table Verified',
        default=False,
        help='Set by the waiter to mark this table as checked / verified.',
    )

    pre_cuenta_printed = fields.Boolean(
        string='Pre-Cuenta Printed',
        default=False,
        help='Set automatically when the Pre-Cuenta is printed for this order.',
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        result = super()._load_pos_data_fields(config_id)
        result += ['is_table_verified', 'pre_cuenta_printed']
        return result
