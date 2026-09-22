# -*- coding: utf-8 -*-
from odoo import models


class AccountMove(models.Model):
    _inherit = 'account.move'

    def has_pos_delivery_customer_details(self):
        self.ensure_one()
        if not self.pos_order_ids:
            return False
        return any(order.config_id.pos_delivery_customer_details for order in self.pos_order_ids)
