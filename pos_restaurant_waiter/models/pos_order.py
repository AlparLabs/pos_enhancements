# -*- coding: utf-8 -*-
from odoo import models, fields


class PosOrder(models.Model):
    _inherit = 'pos.order'

    waiter_id = fields.Many2one(
        'hr.employee',
        string='Waiter',
        help='The employee serving this table.',
        index=True,
    )

