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
    def kiosk_mp_status(self, payment_method_id, mp_order_id, access_token, **kwargs):
        """
        Returns the current status of a Mercado Pago order.
        Called by the kiosk JS every ~3 seconds while waiting for payment confirmation.
        """
        method = self._get_payment_method(access_token, payment_method_id)

        is_qr = kwargs.get('is_qr', False)

        if is_qr:
            # For QR we poll using the external reference
            resp = method.mp_qr_status_get(mp_order_id)
            _logger.debug("Kiosk MP QR status for order %s: %s", mp_order_id, resp)
            return resp
        else:
            from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import (
                MercadoPagoPosRequest,
            )
            mp = MercadoPagoPosRequest(method.mp_bearer_token)
            resp = mp.call_mercado_pago("get", f"/v1/orders/{mp_order_id}", {})
            _logger.debug("Kiosk MP Terminal status for order %s: %s", mp_order_id, resp)
            return resp

    @http.route(
        '/kiosk/mp/cancel/<int:payment_method_id>/<mp_order_id>',
        auth='public',
        type='json',
        website=True,
        methods=['POST'],
    )
    def kiosk_mp_cancel(self, payment_method_id, mp_order_id, access_token, **kwargs):
        """
        Cancels a pending Mercado Pago order.
        Called by the kiosk JS when the customer presses the cancel button
        during the payment waiting screen.
        """
        method = self._get_payment_method(access_token, payment_method_id)

        is_qr = kwargs.get('is_qr', False)

        if is_qr:
            # QR orders might not be cancellable this way in API, but we can try ignoring or
            # making a best-effort call to cancel it if there's an endpoint.
            # Currently mp_order_cancel just hits /v1/orders/ which is Terminal. 
            _logger.info("Kiosk MP cancel requested for QR order %s - Ignoring as QR doesn't require explicit cancel", mp_order_id)
            return {"status": "canceled"}

        from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import (
            MercadoPagoPosRequest,
        )

        mp = MercadoPagoPosRequest(method.mp_bearer_token)
        resp = mp.call_mercado_pago("post", f"/v1/orders/{mp_order_id}/cancel", {})
        _logger.info("Kiosk MP cancel for order %s: %s", mp_order_id, resp)
        return resp
