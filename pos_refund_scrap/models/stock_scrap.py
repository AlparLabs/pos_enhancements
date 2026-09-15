# -*- coding: utf-8 -*-
from odoo import api, fields, models


class StockScrap(models.Model):
    _inherit = 'stock.scrap'

    pos_order_id = fields.Many2one(
        'pos.order',
        string="POS Order",
        readonly=True,
        index=True,
        help="POS Order that originated this scrap operation.",
    )
    pos_order_line_id = fields.Many2one(
        'pos.order.line',
        string="POS Order Line",
        readonly=True,
        help="POS Order Line that originated this scrap operation.",
    )

    @api.depends('pos_order_line_id', 'pos_order_line_id.qty')
    def _compute_scrap_qty(self):
        pos_scraps = self.filtered(lambda s: s.pos_order_line_id or s.pos_order_id)
        for scrap in pos_scraps:
            if scrap.pos_order_line_id:
                scrap.scrap_qty = abs(scrap.pos_order_line_id.qty)
            elif scrap.scrap_qty:
                pass
            else:
                scrap.scrap_qty = 1.0
        super(StockScrap, self - pos_scraps)._compute_scrap_qty()

    @api.depends('company_id', 'picking_id', 'pos_order_line_id', 'pos_order_id')
    def _compute_location_id(self):
        pos_scraps = self.filtered(lambda s: s.pos_order_line_id or s.pos_order_id)
        for scrap in pos_scraps:
            if scrap.picking_id:
                scrap.location_id = scrap.picking_id.location_id
        super(StockScrap, self - pos_scraps)._compute_location_id()
