# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    is_scrap_refund = fields.Boolean(
        string='Desechar en reembolso',
        default=False,
        help='Indica si esta l?nea reembolsada se dirigi? a la ubicaci?n de mermas/desechos.',
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields_list = super()._load_pos_data_fields(config)
        if 'is_scrap_refund' not in fields_list:
            fields_list.append('is_scrap_refund')
        return fields_list

    def _should_refund_to_scrap(self):
        """Helper to determine whether this refund line should be sent to scrap location."""
        self.ensure_one()
        if self.is_scrap_refund:
            return True
        config = self.order_id.session_id.config_id
        if not config or not config.refund_to_scrap:
            return False
        if config.refund_scrap_mode == 'all':
            return True
        # Mode category: check if any of the product's pos categories has scrap_on_refund
        categs = self.product_id.pos_categ_ids
        return any(cat.scrap_on_refund for cat in categs)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if 'is_scrap_refund' not in vals and vals.get('qty', 0) < 0:
                order = self.env['pos.order'].browse(vals.get('order_id')) if vals.get('order_id') else False
                config = order.session_id.config_id if order else False
                if config and config.refund_to_scrap:
                    if config.refund_scrap_mode == 'all':
                        vals['is_scrap_refund'] = True
                    else:
                        product = self.env['product.product'].browse(vals.get('product_id'))
                        if any(c.scrap_on_refund for c in product.pos_categ_ids):
                            vals['is_scrap_refund'] = True
        return super().create(vals_list)
