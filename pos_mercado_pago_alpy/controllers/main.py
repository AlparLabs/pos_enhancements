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

        mercado_pago_pattern = r'([^_]+)_(\d+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_\d+)?'

        if not external_reference:
            resource_id = data.get('data', {}).get('id') or data.get('id') or request.params.get('data.id') or request.params.get('id')
            # For Odoo 18, we don't have matched_method easily yet, let's try to extract from all available methods
            if resource_id:
                # We need to iterate over all pos.payment.method that use mercado_pago_alpy
                payment_methods = request.env['pos.payment.method'].sudo().search([('use_payment_terminal', '=', 'mercado_pago_alpy')])
                for pm in payment_methods:
                    if pm.mp_bearer_token:
                        mercado_pago = MercadoPagoPosRequest(pm.mp_bearer_token)
                        try:
                            resp = mercado_pago.call_mercado_pago("get", f"/v1/orders/{resource_id}", {})
                            ext_ref_candidate = resp.get('external_reference', '')
                            if ext_ref_candidate and re.fullmatch(mercado_pago_pattern, ext_ref_candidate):
                                external_reference = ext_ref_candidate
                                break
                        except Exception:
                            pass
                        # fallback for payments API
                        if not external_reference:
                            try:
                                resp = mercado_pago.call_mercado_pago("get", f"/v1/payments/{resource_id}", {})
                                ext_ref_candidate = resp.get('external_reference', '')
                                if ext_ref_candidate and re.fullmatch(mercado_pago_pattern, ext_ref_candidate):
                                    external_reference = ext_ref_candidate
                                    break
                            except Exception:
                                pass

        if not external_reference or not (match := re.fullmatch(mercado_pago_pattern, external_reference)):
            _logger.warning('POST message received with no or malformed "external_reference" key: %s', external_reference)
            return http.Response(status=400)

        session_id_str, payment_method_id_str, _ = match.groups()

        try:
            session_id = int(session_id_str)
        except ValueError:
            session_id = 0

        pos_session_sudo = request.env['pos.session'].sudo().browse(session_id)
        if not pos_session_sudo or pos_session_sudo.state != 'opened':
            # session is invalid or closed. If we have payment method, fallback
            payment_method_sudo = request.env['pos.payment.method'].sudo().browse(int(payment_method_id_str))
            if payment_method_sudo.exists() and payment_method_sudo.use_payment_terminal == 'mercado_pago_alpy':
                configs = request.env['pos.config'].sudo().search([('payment_method_ids', 'in', payment_method_sudo.ids)])
                for config in configs:
                    config._notify('MERCADO_PAGO_LATEST_MESSAGE', {'config_id': config.id})
            _logger.error("Invalid session id: %s", session_id)
            return http.Response('OK', status=200)

        payment_method_sudo = pos_session_sudo.config_id.payment_method_ids.filtered(lambda p: p.id == int(payment_method_id_str))
        if not payment_method_sudo or payment_method_sudo.use_payment_terminal != 'mercado_pago_alpy':
            _logger.error("Invalid payment method id: %s", payment_method_id_str)
            # This error is not related with Mercado Pago, simply acknowledge Mercado Pago message
            return http.Response('OK', status=200)

        # We have to check if this comes from Mercado Pago with the secret key
        secret_key = payment_method_sudo.mp_webhook_secret_key

        # The ID used for signature can be in data['id'] (new format) or data['id'] (legacy root level)
        # In the new format, the root ID is the notification ID, but the resource ID is inside data
        resource_id = data.get('data', {}).get('id', data.get('id'))
        
        # Note: Mercado Pago documentation says the template is "id:..." but for the new webhook,
        # it seems to be based on the data.id or the main id. 
        # For legacy webhooks, data['id'] at root was the payment intent ID.
        # For new webhooks, data['data']['id'] is the order ID.
        # However, the signature might be calculated on the root 'data' object or specific fields.
        # Standard Mercado Pago webhook signature usually uses the data.id
        
        webhook_id = request.params.get('data.id') or request.params.get('id') or data.get('data', {}).get('id') or data.get('id')
        signed_template = f"id:{webhook_id};request-id:{x_request_id};ts:{ts};"
        cyphed_signature = hmac.new(secret_key.encode(), signed_template.encode(), hashlib.sha256).hexdigest()
        
        if not hmac.compare_digest(cyphed_signature, v1):
            _logger.error('Webhook authenticating failure, ts: %s, v1: %s', ts, v1)
            return http.Response(status=401)

        _logger.debug('Webhook authenticated, POST message: %s', data)

        # Notify the frontend that we received a message from Mercado Pago
        pos_session_sudo.config_id._notify('MERCADO_PAGO_LATEST_MESSAGE', {
            'config_id': pos_session_sudo.config_id.id
        })

        # Acknowledge Mercado Pago message
        return http.Response('OK', status=200)