# -*- coding: utf-8 -*-
import logging

from odoo import api, models

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    @api.model
    def _load_pos_self_data_domain(self, data):
        """
        Extend the kiosk payment method whitelist to include Mercado Pago Alpy.
        Without this override, the kiosk frontend would never load our payment method.
        """
        domain = super()._load_pos_self_data_domain(data)
        if data['pos.config']['data'][0]['self_ordering_mode'] == 'kiosk':
            # We want to add mercado_pago_alpy to the 'in' list of the use_payment_terminal condition
            new_domain = []
            for condition in domain:
                if isinstance(condition, tuple) and condition[0] == 'use_payment_terminal' and condition[1] == 'in':
                    terminals = list(condition[2])
                    if 'mercado_pago_alpy' not in terminals:
                        terminals.append('mercado_pago_alpy')
                    new_domain.append((condition[0], condition[1], terminals))
                else:
                    new_domain.append(condition)
            return new_domain
        return domain

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

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        amount_decimal = "{:.2f}".format(order.amount_total)

        # Build a unique external reference for the kiosk payment
        external_ref = (
            f"kiosk_{order.session_id.id}_{self.id}_{order.pos_reference}"
        )

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
        resp = mercado_pago.call_mercado_pago("post", "/v1/orders", payload, idempotency_key)

        _logger.info(
            "Kiosk MP order created for %s (terminal: %s): %s",
            order.pos_reference,
            self.mp_id_point_smart_complet,
            resp,
        )

        # Return the full MP response — the kiosk JS will read resp.id to start polling
        return resp
