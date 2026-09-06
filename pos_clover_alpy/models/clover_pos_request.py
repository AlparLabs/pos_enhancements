# -*- coding: utf-8 -*-
# Part of AlparLabs. See LICENSE file for full copyright and licensing details.

import json
import logging
import uuid
import requests
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

TIMEOUT_DEFAULT = 135
TIMEOUT_SHORT = 15

ENV_URLS = {
    'sandbox': 'https://apisandbox.dev.clover.com/connect',
    'production_latam': 'https://api.la.clover.com/connect',
    'production_us': 'https://api.clover.com/connect',
    'production_eu': 'https://api.eu.clover.com/connect',
}


class CloverPosRequest:
    """
    HTTP Client for Clover / Fiserv Semi-Integrated REST Pay Display & Cloud Pay Display API.
    """

    def __init__(self, payment_method):
        self.payment_method = payment_method
        self.bearer_token = (payment_method.sudo().clover_bearer_token or '').strip()
        self.device_id = (payment_method.clover_device_id or '').strip()
        self.pos_id = (payment_method.clover_pos_id or 'ODOO_POS').strip()
        self.connection_type = payment_method.clover_connection_type or 'cloud'
        self.environment = payment_method.clover_environment or 'sandbox'
        self.custom_lan_url = (payment_method.clover_lan_url or '').strip()

    @property
    def base_url(self):
        if self.connection_type == 'lan' and self.custom_lan_url:
            url = self.custom_lan_url.rstrip('/')
            if not url.endswith('/connect'):
                url += '/connect'
            return url

        if self.environment == 'production':
            # Default production region for Clover Argentina / LATAM
            return ENV_URLS['production_latam']
        return ENV_URLS.get(self.environment, ENV_URLS['sandbox'])

    def _get_headers(self, idempotency_key=None):
        if not self.bearer_token:
            raise UserError("Clover Bearer Token / API Token is not configured.")
        if not self.device_id:
            raise UserError("Clover Device Serial Number (Device ID) is not configured.")

        headers = {
            'Authorization': f'Bearer {self.bearer_token}',
            'X-Clover-Device-Id': self.device_id,
            'X-POS-Id': self.pos_id,
            'User-Agent': 'OdooPOS-Clover/19.0 (AlparLabs)',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
        if idempotency_key:
            headers['Idempotency-Key'] = str(idempotency_key)
        return headers

    def _call(self, method, endpoint, payload=None, idempotency_key=None, timeout=TIMEOUT_DEFAULT):
        url = f"{self.base_url}{endpoint}"
        headers = self._get_headers(idempotency_key=idempotency_key)

        _logger.info(
            "Clover Request -> %s %s | Device: %s | POS: %s",
            method, url, self.device_id, self.pos_id
        )

        try:
            req_kwargs = {
                'headers': headers,
                'timeout': timeout,
            }
            if payload is not None:
                req_kwargs['json'] = payload

            # For local LAN development self-signed certs if needed
            if self.connection_type == 'lan':
                req_kwargs['verify'] = False

            response = requests.request(method, url, **req_kwargs)

            _logger.info(
                "Clover Response <- [%s] %s",
                response.status_code, response.text[:300] if response.text else ''
            )

            # Clover returns 200 on success, 209 if user canceled on terminal
            if response.status_code == 209:
                return {
                    'status': 'canceled',
                    'code': 'user_canceled',
                    'message': 'Operation was canceled on the Clover device.',
                }

            if response.status_code in (200, 201):
                try:
                    return response.json()
                except Exception:
                    return {'status': 'ok', 'raw': response.text}

            # Error responses (400, 401, 500, 503, etc.)
            try:
                error_data = response.json()
                err_msg = error_data.get('message') or error_data.get('code') or response.text
            except Exception:
                err_msg = response.text or f"HTTP Error {response.status_code}"

            _logger.warning("Clover API Error [%s]: %s", response.status_code, err_msg)
            return {
                'status': 'error',
                'http_code': response.status_code,
                'message': err_msg,
            }

        except requests.exceptions.Timeout:
            _logger.error("Clover Request Timeout calling %s", url)
            return {
                'status': 'timeout',
                'message': 'Clover terminal did not respond in time (Timeout).',
            }
        except requests.exceptions.ConnectionError as ce:
            _logger.error("Clover Connection Error calling %s: %s", url, ce)
            return {
                'status': 'error',
                'message': f'Cannot reach Clover server or device: {ce}',
            }
        except Exception as e:
            _logger.exception("Unexpected error communicating with Clover: %s", e)
            return {
                'status': 'error',
                'message': str(e),
            }

    # ── High Level API Methods ────────────────────────────────────────────────

    def ping(self):
        """Verify connectivity with the terminal."""
        return self._call('POST', '/v1/device/ping', payload={}, timeout=TIMEOUT_SHORT)

    def create_payment(self, amount_cents, external_payment_id, regional_extras=None, capture=True, is_final=True):
        """
        Send payment request to the Clover terminal.
        """
        payload = {
            'amount': int(amount_cents),
            'externalPaymentId': str(external_payment_id),
            'final': bool(is_final),
            'capture': bool(capture),
        }

        if regional_extras:
            payload['regionalExtras'] = regional_extras

        idempotency_key = external_payment_id or str(uuid.uuid4())
        return self._call(
            'POST',
            '/v1/payments',
            payload=payload,
            idempotency_key=idempotency_key,
            timeout=TIMEOUT_DEFAULT,
        )

    def get_payment_by_external_id(self, external_payment_id):
        """Query payment status by external payment ID."""
        endpoint = f"/v1/payments/external/{external_payment_id}"
        return self._call('GET', endpoint, timeout=TIMEOUT_SHORT)

    def cancel(self):
        """Cancel current in-flight operation on terminal."""
        res = self._call('POST', '/v1/device/cancel', payload={}, timeout=TIMEOUT_SHORT)
        # Attempt to return device to welcome screen
        self.show_welcome()
        return res

    def void_payment(self, payment_id, reason='USER_CANCEL'):
        """Void a transaction before settlement (within 25 min)."""
        endpoint = f"/v1/payments/{payment_id}/void"
        payload = {'voidReason': reason}
        return self._call('POST', endpoint, payload=payload, timeout=TIMEOUT_SHORT)

    def refund_payment(self, payment_id, amount_cents=None):
        """Refund a payment transaction."""
        endpoint = f"/v1/payments/{payment_id}/refund"
        payload = {}
        if amount_cents:
            payload['amount'] = int(amount_cents)
        return self._call('POST', endpoint, payload=payload, timeout=TIMEOUT_SHORT)

    def show_welcome(self):
        """Return device to idle welcome screen."""
        return self._call('POST', '/v1/device/welcome', payload={}, timeout=TIMEOUT_SHORT)

    def show_message(self, message, beep=False):
        """Display a text message on the device screen."""
        payload = {'text': str(message), 'beep': bool(beep)}
        return self._call('POST', '/v1/device/display', payload=payload, timeout=TIMEOUT_SHORT)
