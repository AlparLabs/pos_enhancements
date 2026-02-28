# -*- coding: utf-8 -*-
import logging

from odoo import http
from odoo.http import request
from werkzeug.exceptions import NotFound, Forbidden

_logger = logging.getLogger(__name__)


class KioskMercadoPagoController(http.Controller):
    """
    Secure kiosk endpoints for Mercado Pago payment polling and cancellation.

    These routes are auth='public' but are protected by the POS access_token,
    exactly the same pattern used by pos_self_order's own controller.
    No logged-in Odoo session is required, making them safe for kiosk use.
    """

    def _get_payment_method(self, access_token, payment_method_id):
        """
        Resolve and validate the payment method.
        - Finds the pos.config by access_token (same as _verify_pos_config in pos_self_order)
        - Confirms the payment method belongs to that config
        - Returns a sudo() record to allow API calls
        """
        pos_config = request.env['pos.config'].sudo().search(
            [('access_token', '=', access_token)], limit=1
        )
        if not pos_config:
            raise Forbidden("Invalid access token.")

        method = pos_config.env['pos.payment.method'].sudo().browse(payment_method_id)
        if not method.exists() or method not in pos_config.payment_method_ids:
            raise NotFound("Payment method not found for this POS configuration.")

        if method.use_payment_terminal != 'mercado_pago_alpy':
            raise NotFound("Payment method is not a Mercado Pago terminal.")

        return method

    @http.route(
        '/kiosk/mp/status/<int:payment_method_id>/<mp_order_id>',
        auth='public',
        type='json',
        website=True,
    )
    def kiosk_mp_status(self, payment_method_id, mp_order_id, access_token):
        """
        Returns the current status of a Mercado Pago order.
        Called by the kiosk JS every ~3 seconds while waiting for payment confirmation.

        Returns the full MP order object, including its 'status' field.
        Terminal states are: created, at_terminal, action_required,
                             processed, finished, canceled, failed, expired
        """
        method = self._get_payment_method(access_token, payment_method_id)

        from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import (
            MercadoPagoPosRequest,
        )

        mp = MercadoPagoPosRequest(method.mp_bearer_token)
        resp = mp.call_mercado_pago("get", f"/v1/orders/{mp_order_id}", {})
        _logger.debug("Kiosk MP status for order %s: %s", mp_order_id, resp)
        return resp

    @http.route(
        '/kiosk/mp/cancel/<int:payment_method_id>/<mp_order_id>',
        auth='public',
        type='json',
        website=True,
        methods=['POST'],
    )
    def kiosk_mp_cancel(self, payment_method_id, mp_order_id, access_token):
        """
        Cancels a pending Mercado Pago order.
        Called by the kiosk JS when the customer presses the cancel button
        during the payment waiting screen.

        Note: MP only allows cancellation when the order status is
        'created' or 'action_required'. If the terminal has already
        processed it, this call will gracefully return an error which
        the JS ignores (best-effort cancel).
        """
        method = self._get_payment_method(access_token, payment_method_id)

        from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import (
            MercadoPagoPosRequest,
        )

        mp = MercadoPagoPosRequest(method.mp_bearer_token)
        resp = mp.call_mercado_pago("post", f"/v1/orders/{mp_order_id}/cancel", {})
        _logger.info("Kiosk MP cancel for order %s: %s", mp_order_id, resp)
        return resp
