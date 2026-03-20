# -*- coding: utf-8 -*-

from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    start_time = fields.Datetime('Start Time')
    duration = fields.Float('Total Duration')



