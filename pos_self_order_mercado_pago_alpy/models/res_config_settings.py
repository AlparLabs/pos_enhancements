# -*- coding: utf-8 -*-
from odoo import models, api

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    @api.onchange("pos_payment_method_ids")
    def _onchange_pos_payment_method_ids(self):
        # We explicitly OVERRIDE this method from pos_self_order to do nothing.
        # Natively, it raises a ValidationError if a cash method is added to Kiosk mode.
        # We want to allow cash (Pay at Counter) alongside Mercado Pago.
        pass
