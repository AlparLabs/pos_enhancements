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
        For Mercado Pago, we create the MP order immediately and return the full
        MP response (including its id) so the kiosk JavaScript can poll for
        the payment result asynchronously via /kiosk/mp/status/.
        """
        if self.use_payment_terminal != 'mercado_pago_alpy':
            return super()._payment_request_from_kiosk(order)

        from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import (
            MercadoPagoPosRequest,
        )

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

            mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
            amount_decimal = "{:.2f}".format(float(amount_total))

            # Build a unique external reference for the kiosk payment
            external_ref = f"kiosk_{session_id}_{self.id}_{pos_reference}"

            payload = {
                "type": "point",
                "external_reference": external_ref,
                "transactions": {
                    "payments": [{"amount": amount_decimal}]
                },
                "config": {
                    "point": {"terminal_id": self.mp_id_point_smart_complet}
                },
            }

            # Idempotency key ensures retries don't create duplicate orders
            idempotency_key = f"kiosk_{external_ref}"
            
            _logger.info("Mercado Pago Kiosk request payload: %s", payload)
            resp = mercado_pago.call_mercado_pago("post", "/v1/orders", payload, idempotency_key)

            _logger.info(
                "Kiosk MP order created for %s (terminal: %s): %s",
                pos_reference,
                self.mp_id_point_smart_complet,
                resp,
            )

            # Return the full MP response — the kiosk JS will read resp.id to start polling
            return resp

        except Exception as e:
            _logger.error("Mercado Pago Kiosk Error: %s", str(e), exc_info=True)
            # Raise an exception with a clear message so the Kiosk frontend catch block shows it
            raise ValueError(f"Failed to create Mercado Pago order via Kiosk: {str(e)}")
