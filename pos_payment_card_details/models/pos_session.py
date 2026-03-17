# -*- coding: utf-8 -*-
from odoo import models

class PosSession(models.Model):
    _inherit = 'pos.session'

    def get_closing_control_data(self):
        data = super().get_closing_control_data()
        
        # We need to inject the detailed card transactions
        # data['default_amounts_by_payment_method'] contains the summary.
        # Let's add 'card_details_by_payment_method' to data
        
        # Fetch all card payments for this session that have at least one detail
        payments = self.env['pos.payment'].search([
            ('session_id', '=', self.id),
            '|', '|',
            ('lot_number', '!=', False),
            ('coupon_number', '!=', False),
            ('installments', '>', 1)
        ])
        
        card_details = {}
        for pm in payments:
            pm_name = pm.payment_method_id.name
            if pm_name not in card_details:
                card_details[pm_name] = []
                
            card_details[pm_name].append({
                'amount': pm.amount,
                'lot_number': pm.lot_number or '',
                'coupon_number': pm.coupon_number or '',
                'installments': pm.installments or 1,
            })
            
        data['card_details_by_payment_method'] = [{'name': k, 'transactions': v} for k, v in card_details.items()]
        
        return data
