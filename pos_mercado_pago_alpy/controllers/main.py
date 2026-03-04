# Part of Odoo. See LICENSE file for full copyright and licensing details.
import hashlib
import hmac
import json
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

        Handles multiple webhook types:
        - 'order': New Orders API format — includes external_reference in data
        - 'point_integration_wh': Legacy Point integration — may include external_reference in additional_info
        - 'payment': Payment status changes — requires API call to resolve external_reference
        """

        # ── 1. Log full request for debugging ─────────────────────────────
        raw_body = request.httprequest.get_data(as_text=True)
        webhook_type = request.params.get('type') or request.params.get('topic') or 'unknown'
        data_id_param = request.params.get('data.id', request.params.get('id', ''))
        _logger.info(
            'MP Webhook received [type/topic=%s, data.id=%s]: body=%s',
            webhook_type, data_id_param, raw_body
        )

        # ── 2. Validate mandatory headers ─────────────────────────────────
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

        # ── 3. Parse JSON body ────────────────────────────────────────────
        data = request.httprequest.get_json(silent=True)
        if not data:
            _logger.warning('POST message received with no JSON data')
            return http.Response(status=400)

        # ── 4. Authenticate webhook signature against ALL MP payment methods ──
        # We validate the signature BEFORE extracting external_reference,
        # because some webhook types don't include external_reference in the body.
        # We try all mercado_pago_alpy payment methods' secret keys.
        all_mp_methods = request.env['pos.payment.method'].sudo().search([
            ('use_payment_terminal', '=', 'mercado_pago_alpy'),
            ('mp_webhook_secret_key', '!=', False),
        ])

        if not all_mp_methods:
            _logger.error('No Mercado Pago Alpy payment methods configured with a webhook secret key')
            return http.Response(status=500)

        webhook_id = request.params.get('data.id') or request.params.get('id') or data.get('data', {}).get('id') or data.get('id')
        signed_template = f"id:{webhook_id};request-id:{x_request_id};ts:{ts};"
        signature_valid = False
        matched_method = None

        for pm in all_mp_methods:
            secret_key = pm.mp_webhook_secret_key
            if not secret_key:
                continue
            cyphed_signature = hmac.new(secret_key.encode(), signed_template.encode(), hashlib.sha256).hexdigest()
            if hmac.compare_digest(cyphed_signature, v1):
                signature_valid = True
                matched_method = pm
                break

        if not signature_valid:
            _logger.error(
                'Webhook signature validation failed for ALL payment methods. ts: %s, v1: %s, template: %s',
                ts, v1, signed_template
            )
            return http.Response(status=401)

        _logger.info('Webhook signature validated with payment method id=%s', matched_method.id)

        # ── 5. Extract external_reference ─────────────────────────────────
        # The external_reference format: "{session_id}_{payment_method_id}_{order_uuid}[_{timestamp}]"
        mercado_pago_pattern = r'([^_]+)_(\d+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_\d+)?'

        external_reference = None

        # Try new Orders API format: data.external_reference
        ext_ref_candidate = data.get('data', {}).get('external_reference')
        if ext_ref_candidate and re.fullmatch(mercado_pago_pattern, ext_ref_candidate):
            external_reference = ext_ref_candidate

        # Fallback: legacy format additional_info.external_reference
        if not external_reference:
            ext_ref_candidate = data.get('additional_info', {}).get('external_reference')
            if ext_ref_candidate and re.fullmatch(mercado_pago_pattern, ext_ref_candidate):
                external_reference = ext_ref_candidate

        # Fallback: root-level external_reference
        if not external_reference:
            ext_ref_candidate = data.get('external_reference')
            if ext_ref_candidate and re.fullmatch(mercado_pago_pattern, ext_ref_candidate):
                external_reference = ext_ref_candidate

        # Last resort: call MP API to fetch the order/payment and get external_reference
        if not external_reference:
            resource_id = data.get('data', {}).get('id') or data.get('id') or request.params.get('data.id') or request.params.get('id')
            _logger.info(
                'external_reference not found in webhook body, attempting API lookup. '
                'type=%s, resource_id=%s', webhook_type, resource_id
            )
            if resource_id and matched_method.mp_bearer_token:
                mercado_pago = MercadoPagoPosRequest(matched_method.mp_bearer_token)

                # Try fetching as an order first
                try:
                    resp = mercado_pago.call_mercado_pago("get", f"/v1/orders/{resource_id}", {})
                    ext_ref_candidate = resp.get('external_reference', '')
                    if ext_ref_candidate and re.fullmatch(mercado_pago_pattern, ext_ref_candidate):
                        external_reference = ext_ref_candidate
                        _logger.info('Resolved external_reference from Orders API: %s', external_reference)
                except Exception:
                    pass

                # Try fetching as a payment
                if not external_reference:
                    try:
                        resp = mercado_pago.call_mercado_pago("get", f"/v1/payments/{resource_id}", {})
                        ext_ref_candidate = resp.get('external_reference', '')
                        if ext_ref_candidate and re.fullmatch(mercado_pago_pattern, ext_ref_candidate):
                            external_reference = ext_ref_candidate
                            _logger.info('Resolved external_reference from Payments API: %s', external_reference)
                    except Exception:
                        pass

        if not external_reference:
            _logger.warning(
                'Could not resolve external_reference from webhook body or API. type=%s, body=%s',
                webhook_type, data
            )
            # Acknowledge so MP doesn't keep retrying with the same unresolvable payload
            return http.Response('OK', status=200)

        # ── 6. Extract session and payment method from external_reference ──
        match = re.fullmatch(mercado_pago_pattern, external_reference)
        session_id_str, payment_method_id_str, _ = match.groups()

        try:
            session_id = int(session_id_str)
        except ValueError:
            session_id = 0

        payment_method_id = int(payment_method_id_str)

        pos_session_sudo = request.env['pos.session'].sudo().browse(session_id)
        if not pos_session_sudo.exists() or pos_session_sudo.state != 'opened':
            _logger.warning("Webhook for session id=%s but session is not open (state=%s)",
                          session_id, pos_session_sudo.state if pos_session_sudo.exists() else 'NOT FOUND')
            payment_method_sudo = request.env['pos.payment.method'].sudo().browse(payment_method_id)
            if payment_method_sudo.exists() and payment_method_sudo.use_payment_terminal == 'mercado_pago_alpy':
                configs = request.env['pos.config'].sudo().search([('payment_method_ids', 'in', payment_method_sudo.ids)])
                for config in configs:
                    config._notify('MERCADO_PAGO_LATEST_MESSAGE', {'config_id': config.id})
            return http.Response('OK', status=200)

        payment_method_sudo = pos_session_sudo.config_id.payment_method_ids.filtered(
            lambda p: p.id == payment_method_id
        )
        if not payment_method_sudo or payment_method_sudo.use_payment_terminal != 'mercado_pago_alpy':
            _logger.warning("Webhook for payment method id=%s but not found or not mercado_pago_alpy", payment_method_id)
            return http.Response('OK', status=200)

        # ── 7. Notify the POS frontend ────────────────────────────────────
        _logger.info(
            'Webhook authenticated and matched. Notifying POS config_id=%s (session=%s, external_ref=%s)',
            pos_session_sudo.config_id.id, session_id, external_reference
        )
        pos_session_sudo.config_id._notify('MERCADO_PAGO_LATEST_MESSAGE', {
            'config_id': pos_session_sudo.config_id.id
        })

        return http.Response('OK', status=200)