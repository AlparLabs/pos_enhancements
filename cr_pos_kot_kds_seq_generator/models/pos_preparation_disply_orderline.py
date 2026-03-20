# -*- coding: utf-8 -*-
# Part of Creyox Technologies.

from odoo import models, fields


class PosPreparationDisplayOrderline(models.Model):
    _inherit = "pos_preparation_display.orderline"

    pos_order_line_id = fields.Many2one(
        "pos.order.line",
        string="POS Order Line",
        help="Link to the original POS order line",
    )
