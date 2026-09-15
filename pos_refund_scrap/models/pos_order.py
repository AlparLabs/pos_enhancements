# -*- coding: utf-8 -*-
from odoo import fields, models


class PosOrder(models.Model):
    _inherit = 'pos.order'

    scrap_ids = fields.One2many(
        'stock.scrap',
        'pos_order_id',
        string="Scrap Orders",
        readonly=True,
    )
    scrap_count = fields.Integer(
        string="Scraps",
        compute='_compute_scrap_count',
    )

    def _compute_scrap_count(self):
        for order in self:
            order.scrap_count = len(order.scrap_ids)

    def action_view_scrap(self):
        self.ensure_one()
        action = self.env["ir.actions.actions"]._for_xml_id("stock.action_stock_scrap")
        action['domain'] = [('id', 'in', self.scrap_ids.ids)]
        action['context'] = dict(self.env.context, default_pos_order_id=self.id, create=False)
        return action
