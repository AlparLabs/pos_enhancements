# -*- coding: utf-8 -*-
from typing import Any
from odoo import models, fields, api

class ReportSaleDetails(models.AbstractModel):
    _inherit = 'report.point_of_sale.report_saledetails'

    @api.model
    def get_sale_details(self, date_start: Any = False, date_stop: Any = False, config_ids: Any = False, session_ids: Any = False, **kwargs: Any) -> dict[str, Any]:
        # Call super to get the original report data.
        # v19 added **kwargs to the core signature — pass them through.
        data = super().get_sale_details(date_start, date_stop, config_ids, session_ids, **kwargs)
        
        # Determine the domain for payments based on sessions or config dates
        domain = [('is_change', '=', False)]
        if session_ids:
            domain.append(('session_id', 'in', session_ids))
        if data.get('currency'):
            # It's better to just use the payments we already fetched or domain from pos.order
            pass
            
        # The original get_sale_details already computes `payments` but only groups them by payment method name.
        # We need to fetch the underlying pos.payment records for the sessions/dates 
        # to construct our detailed card transactions list.
        
        # Build the same pos.order domain as the original method 
        # (Though simpler is just finding pos.payments related to those orders or sessions)
        orders_domain = [('state', 'in', ['paid', 'invoiced', 'done'])]
        if session_ids:
            orders_domain.append(('session_id', 'in', session_ids))
        elif config_ids:
            orders_domain.append(('config_id', 'in', config_ids))

        # We need the dates as well.
        if date_start:
            orders_domain.append(('date_order', '>=', fields.Datetime.to_string(date_start)))
        if date_stop:
            orders_domain.append(('date_order', '<=', fields.Datetime.to_string(date_stop)))
            
        orders = self.env['pos.order'].search(orders_domain)
        
        # Fetch the card payments for these orders
        payments = self.env['pos.payment'].search([
            ('pos_order_id', 'in', orders.ids),
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
