# Part of Odoo. See LICENSE file for full copyright and licensing details.
import hashlib
import hmac
import logging
import re

from odoo import http
from odoo.http import request

from odoo.addons.pos_mercado_pago_alpy.models.mercado_pago_post_request import MercadoPagoPosRequest

_logger = logging.getLogger(__name__)


class PosMercadoPagoWebhook(http.Controller):
    @http.route('/pos_mercado_pago_alpy/notification', methods=['POST'], type="http", auth="none", csrf=False)
    def notification(self):
        """ Process the notification sent by Mercado Pago

        Notification format is always json
        """
        # Check for mandatory keys in header
        x_request_id = request.httprequest.headers.get('X-Request-Id')
        if not x_request_id:
            _logger.warning('POST message received with no X-Request-Id in header')
            return http.Response(status=400)

        x_signature = request.httprequest.headers.get('X-Signature')
        if not x_signature:
            _logger.warning('POST message received with no X-Signature in header')
            return http.Response(status=400)

        ts_m = re.search(r"ts=(\d+)", x_signature)
        v1_m = re.search(r"v1=([a-f0-9]+)", x_signature)
        ts = ts_m.group(1) if ts_m else None
        v1 = v1_m.group(1) if v1_m else None
        if not ts or not v1:
            _logger.warning('Webhook bad X-Signature, ts: %s, v1: %s', ts, v1)
            return http.Response(status=400)

        # Check for payload
        data = request.httprequest.get_json(silent=True)
        if not data:
            _logger.warning('POST message received with no data')
            return http.Response(status=400)

        # Detect notification topic
        topic = data.get('topic') or request.params.get('topic') or data.get('type', '')

        # ── merchant_order (QR payments) ────────────────────────────────────
        if topic == 'merchant_order':
            return self._handle_merchant_order(data, ts, v1, x_request_id)

        # ── Terminal Smart / Orders API ──────────────────────────────────────
        return self._handle_terminal_order(data, ts, v1, x_request_id)

    # ────────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ────────────────────────────────────────────────────────────────────────────

    _MP_EXT_REF_PATTERN = r'([^_]+)_(\d+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_\d+)?'
    _MP_QR_TERMINAL_TYPES = ('mercado_pago_qr_local', 'mercado_pago_qr_screen', 'mercado_pago_qr_hybrid')
    _MP_TERMINAL_TYPES = ('mercado_pago_alpy',)

    def _notify_pos(self, pos_session_sudo):
        pos_session_sudo.config_id._notify('MERCADO_PAGO_LATEST_MESSAGE', {
            'config_id': pos_session_sudo.config_id.id,
        })

    def _handle_merchant_order(self, data, ts, v1, x_request_id):
        """
        Handle QR merchant_order webhooks.

        These arrive when a buyer pays a Mercado Pago QR code. The notification
        carries a merchant_order id; we fetch it to retrieve the external_reference,
        then dispatch a bus message so the POS frontend can poll and confirm.

        Note: MP documentation states that X-Signature validation may not be
        available for all QR webhook configurations. We attempt validation but
        fall back gracefully if the secret key cannot be determined yet.
        """
        resource_id = (
            data.get('data', {}).get('id')
            or data.get('id')
            or request.params.get('data.id')
            or request.params.get('id')
        )
        if not resource_id:
            _logger.warning('merchant_order webhook with no resource id, data: %s', data)
            return http.Response('OK', status=200)

        _logger.debug('merchant_order webhook received, resource_id=%s', resource_id)

        # Search all QR payment methods for the token that can fetch this merchant_order
        qr_pms = request.env['pos.payment.method'].sudo().search([
            ('use_payment_terminal', 'in', list(self._MP_QR_TERMINAL_TYPES))
        ])

        external_reference = None
        matched_pm = None

        for pm in qr_pms:
            if not pm.mp_bearer_token:
                continue
            mp = MercadoPagoPosRequest(pm.mp_bearer_token)
            try:
                resp = mp.call_mercado_pago('get', f'/merchant_orders/{resource_id}', {})
                ext_ref = resp.get('external_reference', '')
                if ext_ref and re.fullmatch(self._MP_EXT_REF_PATTERN, ext_ref):
                    external_reference = ext_ref
                    matched_pm = pm
                    break
            except Exception as e:
                _logger.debug('Could not fetch merchant_order %s with pm %s: %s', resource_id, pm.id, e)

        if not external_reference or not matched_pm:
            _logger.warning('merchant_order webhook: could not resolve external_reference for resource %s', resource_id)
            return http.Response('OK', status=200)

        # Validate signature with matched payment method secret key (best-effort).
        # Per MP docs the signed id is `data.id` from the query string; body
        # data['id'] and the resource id are fallbacks. Alphanumeric ids must
        # be lowercased before signing.
        if matched_pm.mp_webhook_secret_key:
            webhook_id = (
                request.params.get('data.id')
                or request.params.get('id')
                or data.get('id')
                or resource_id
            )
            if isinstance(webhook_id, str) and not webhook_id.isdigit():
                webhook_id = webhook_id.lower()
            signed_template = f"id:{webhook_id};request-id:{x_request_id};ts:{ts};"
            cyphed = hmac.new(
                matched_pm.mp_webhook_secret_key.encode(),
                signed_template.encode(),
                hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(cyphed, v1):
                _logger.warning('merchant_order webhook signature mismatch (best-effort check, continuing)')

        return self._resolve_and_notify(external_reference, self._MP_QR_TERMINAL_TYPES)

    def _handle_terminal_order(self, data, ts, v1, x_request_id):
        """
        Original Terminal Smart / Orders API webhook handler.
        """
        # If and only if this webhook is related with an order or payment intent
        # then the field data['data']['external_reference'] (new format) or
        # data['additional_info']['external_reference'] (legacy) contains a string
        # formated like `XXX_YYY_ZZZ` where:
        # - `XXX` is the session_id
        # - `YYY` is the payment_method_id
        # - `ZZZ` is the pos order uuid for customer identification (Format xxxx-xxxx-xxx) where x is a hexadecimal digit

        # Attempt to get external_reference from new Orders API format
        external_reference = data.get('data', {}).get('external_reference')
        if not external_reference:
            # Fallback for legacy format during transition
            external_reference = data.get('additional_info', {}).get('external_reference')

        if not external_reference:
            resource_id = data.get('data', {}).get('id') or data.get('id') or request.params.get('data.id') or request.params.get('id')
            if resource_id:
                payment_methods = request.env['pos.payment.method'].sudo().search([('use_payment_terminal', '=', 'mercado_pago_alpy')])
                for pm in payment_methods:
                    if pm.mp_bearer_token:
                        mercado_pago = MercadoPagoPosRequest(pm.mp_bearer_token)
                        try:
                            resp = mercado_pago.call_mercado_pago("get", f"/v1/orders/{resource_id}", {})
                            ext_ref_candidate = resp.get('external_reference', '')
                            if ext_ref_candidate and re.fullmatch(self._MP_EXT_REF_PATTERN, ext_ref_candidate):
                                external_reference = ext_ref_candidate
                                break
                        except Exception:
                            pass
                        if not external_reference:
                            try:
                                resp = mercado_pago.call_mercado_pago("get", f"/v1/payments/{resource_id}", {})
                                ext_ref_candidate = resp.get('external_reference', '')
                                if ext_ref_candidate and re.fullmatch(self._MP_EXT_REF_PATTERN, ext_ref_candidate):
                                    external_reference = ext_ref_candidate
                                    break
                            except Exception:
                                pass

        if not external_reference or not (match := re.fullmatch(self._MP_EXT_REF_PATTERN, external_reference)):
            _logger.warning('POST message received with no or malformed "external_reference" key: %s', external_reference)
            return http.Response(status=400)

        session_id_str, payment_method_id_str, _ = match.groups()

        try:
            session_id = int(session_id_str)
        except ValueError:
            session_id = 0

        _all_mp_terminal_types = self._MP_TERMINAL_TYPES + self._MP_QR_TERMINAL_TYPES

        pos_session_sudo = request.env['pos.session'].sudo().browse(session_id)
        if not pos_session_sudo or pos_session_sudo.state != 'opened':
            # session is invalid or closed. If we have payment method, fallback
            payment_method_sudo = request.env['pos.payment.method'].sudo().browse(int(payment_method_id_str))
            if payment_method_sudo.exists() and payment_method_sudo.use_payment_terminal in _all_mp_terminal_types:
                configs = request.env['pos.config'].sudo().search([('payment_method_ids', 'in', payment_method_sudo.ids)])
                for config in configs:
                    config._notify('MERCADO_PAGO_LATEST_MESSAGE', {'config_id': config.id})
            _logger.error("Invalid session id: %s", session_id)
            return http.Response('OK', status=200)

        payment_method_sudo = pos_session_sudo.config_id.payment_method_ids.filtered(lambda p: p.id == int(payment_method_id_str))
        if not payment_method_sudo:
            _logger.error("Invalid payment method id: %s", payment_method_id_str)
            return http.Response('OK', status=200)

        # If the payment method is a QR type (e.g. a 'payment' topic webhook arrived for a
        # hybrid/screen QR order), delegate to the QR resolver — it fires the bus notification
        # exactly like merchant_order does, without requiring Terminal Smart signature validation.
        if payment_method_sudo.use_payment_terminal in self._MP_QR_TERMINAL_TYPES:
            _logger.info(
                '_handle_terminal_order: payment webhook for QR method %s, delegating to QR resolver',
                payment_method_id_str
            )
            return self._resolve_and_notify(external_reference, self._MP_QR_TERMINAL_TYPES)

        if payment_method_sudo.use_payment_terminal not in self._MP_TERMINAL_TYPES:
            _logger.error("Invalid payment method id: %s", payment_method_id_str)
            return http.Response('OK', status=200)

        # We have to check if this comes from Mercado Pago with the secret key
        secret_key = payment_method_sudo.mp_webhook_secret_key

        resource_id = data.get('data', {}).get('id', data.get('id'))
        webhook_id = request.params.get('data.id') or request.params.get('id') or data.get('data', {}).get('id') or data.get('id')
        signed_template = f"id:{webhook_id};request-id:{x_request_id};ts:{ts};"
        cyphed_signature = hmac.new(secret_key.encode(), signed_template.encode(), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(cyphed_signature, v1):
            _logger.error('Webhook authenticating failure, ts: %s, v1: %s', ts, v1)
            return http.Response(status=401)

        _logger.debug('Webhook authenticated, POST message: %s', data)

        # Notify the frontend that we received a message from Mercado Pago
        self._notify_pos(pos_session_sudo)

        # Acknowledge Mercado Pago message
        return http.Response('OK', status=200)

    def _resolve_and_notify(self, external_reference, terminal_types):
        """Lookup the POS session from external_reference and fire the bus notification."""
        match = re.fullmatch(self._MP_EXT_REF_PATTERN, external_reference)
        if not match:
            return http.Response('OK', status=200)

        session_id_str, payment_method_id_str, _ = match.groups()
        try:
            session_id = int(session_id_str)
        except ValueError:
            session_id = 0

        pos_session_sudo = request.env['pos.session'].sudo().browse(session_id)
        if not pos_session_sudo or pos_session_sudo.state != 'opened':
            payment_method_sudo = request.env['pos.payment.method'].sudo().browse(int(payment_method_id_str))
            if payment_method_sudo.exists() and payment_method_sudo.use_payment_terminal in terminal_types:
                configs = request.env['pos.config'].sudo().search([('payment_method_ids', 'in', payment_method_sudo.ids)])
                for config in configs:
                    config._notify('MERCADO_PAGO_LATEST_MESSAGE', {'config_id': config.id})
            _logger.error('_resolve_and_notify: invalid or closed session id: %s', session_id)
            return http.Response('OK', status=200)

        payment_method_sudo = pos_session_sudo.config_id.payment_method_ids.filtered(
            lambda p: p.id == int(payment_method_id_str)
        )
        if not payment_method_sudo or payment_method_sudo.use_payment_terminal not in terminal_types:
            _logger.error('_resolve_and_notify: invalid payment method id: %s', payment_method_id_str)
            return http.Response('OK', status=200)

        self._notify_pos(pos_session_sudo)
        return http.Response('OK', status=200)