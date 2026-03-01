# -*- coding: utf-8 -*-
import logging

from odoo import api, models

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    @api.model
    def _load_pos_self_data_domain(self, data):
        """
        Extend the kiosk payment method whitelist to allow ALL configured payment methods,
        including Mercado Pago Alpy and non-terminal methods like Cash, so the customer 
        can choose where to pay on the Kiosk screen natively.
        """
        if data['pos.config']['data'][0]['self_ordering_mode'] == 'kiosk':
            return [('id', 'in', data['pos.config']['data'][0]['payment_method_ids'])]
        return super()._load_pos_self_data_domain(data)

    def _payment_request_from_kiosk(self, order):
        """
        Called by the /kiosk/payment/ route when a kiosk order is submitted.
        Routes the request using the main POS Mercado Pago order creation logic.
        """
        if self.use_payment_terminal != 'mercado_pago_alpy':
            return super()._payment_request_from_kiosk(order)

        try:
            # Check if order is a dictionary (from Kiosk front-end JSON) or an ORM record
            if isinstance(order, dict):
                amount_total = order.get('amount_total', order.get('amount', 0.0))
                session_id = order.get('session_id', 0)
                pos_reference = order.get('pos_reference', 'kiosk')
            else:
                amount_total = order.amount_total
                session_id = order.session_id.id
                pos_reference = order.pos_reference

            # Build a unique external reference for the kiosk payment
            external_ref = f"kiosk_{session_id}_{self.id}_{pos_reference}"

            # Prepare infos assuming mp_order_create expects amount in cents
            infos = {
                'amount': float(amount_total) * 100,
                'additional_info': {
                    'external_reference': external_ref,
                    'payment_method_type': 'credit'  # standard fallback for terminal mode
                }
            }

            _logger.info("Mercado Pago Kiosk request creating order via mp_order_create for reference %s", external_ref)
            resp = self.mp_order_create(infos)

            _logger.info("Kiosk MP order response: %s", resp)

            # Return the full MP response to the frontend
            return resp

        except Exception as e:
            _logger.error("Mercado Pago Kiosk Error: %s", str(e), exc_info=True)
            # Raise an exception with a clear message so the Kiosk frontend catch block shows it
            raise ValueError(f"Failed to create Mercado Pago order via Kiosk: {str(e)}")
            raise ValueError(f"Failed to create Mercado Pago order via Kiosk: {str(e)}")
