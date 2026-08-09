import logging
from typing import Any

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError

from .mercado_pago_post_request import MercadoPagoPosRequest

_logger = logging.getLogger(__name__)

# All payment-terminal types provided by this module.
MP_TERMINAL_TYPES = (
    'mercado_pago_alpy',
    'mercado_pago_qr_local',
    'mercado_pago_qr_screen',
    'mercado_pago_qr_hybrid',
)


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    mp_bearer_token = fields.Char(
        string="Production user token",
        help='Mercado Pago customer production user token: https://www.mercadopago.com.mx/developers/en/reference',
        groups="point_of_sale.group_pos_manager")
    mp_webhook_secret_key = fields.Char(
        string="Production secret key",
        help='Mercado Pago production secret key from integration application: https://www.mercadopago.com.mx/developers/panel/app',
        groups="point_of_sale.group_pos_manager")
    mp_id_point_smart = fields.Char(
        string="Terminal S/N",
        help="Enter your Point Smart terminal serial number written on the back of your terminal (after the S/N:)")
    mp_id_point_smart_complet = fields.Char()

    # QR-specific fields
    mp_external_pos_id = fields.Char(
        string="POS ID (QR)",
        help="Alphanumeric ID of the POS (cash register) configured in Mercado Pago, e.g. CAJA01. Required for QR payments.")
    mp_user_id = fields.Char(
        string="Seller User ID (QR)",
        help="Your numeric Mercado Pago user/seller ID. Required for QR payments.")
    mp_qr_string = fields.Char(
        string="QR URL / String",
        help="Scan the physical QR code with your phone camera (not the Mercado Pago app) and paste the URL here. Required to render the QR on the POS screen.")

    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [
            ('mercado_pago_alpy', 'Mercado Pago — Terminal Smart'),
            ('mercado_pago_qr_local', 'Mercado Pago — QR Local (Físico)'),
            ('mercado_pago_qr_screen', 'Mercado Pago — QR en Pantalla'),
            ('mercado_pago_qr_hybrid', 'Mercado Pago — QR Híbrido'),
        ]

    @api.model
    def _load_pos_data_fields(self, config_id: Any) -> list[str]:
        params = super()._load_pos_data_fields(config_id)
        params += ['mp_id_point_smart', 'mp_external_pos_id', 'mp_user_id', 'mp_qr_string']
        return params

    def _is_mercado_pago_terminal(self):
        return self.use_payment_terminal in ('mercado_pago_alpy',)

    def _is_mercado_pago_qr(self):
        return self.use_payment_terminal in ('mercado_pago_qr_local', 'mercado_pago_qr_screen', 'mercado_pago_qr_hybrid')

    def _check_special_access(self):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

    def force_pdv(self):
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        _logger.info('Calling Mercado Pago to force the terminal mode to "PDV"')
        mode = {"operating_mode": "PDV"}
        resp = mercado_pago.call_mercado_pago("patch", f"/point/integration-api/devices/{self.mp_id_point_smart_complet}", mode)
        if resp.get("operating_mode") != "PDV":
            raise UserError(_("Unexpected Mercado Pago response: %s", resp))
        _logger.debug("Successfully set the terminal mode to 'PDV'.")
        return None

    def mp_order_create(self, infos):
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        amount_decimal = "{:.2f}".format(infos['amount'] / 100)
        order_payload = {
            "type": "point",
            "external_reference": infos['additional_info']['external_reference'],
            "transactions": {
                "payments": [{"amount": amount_decimal}]
            },
            "config": {
                "point": {"terminal_id": self.mp_id_point_smart_complet}
            },
        }
        idempotency_key = f"order_{infos['additional_info']['external_reference']}"
        resp = mercado_pago.call_mercado_pago("post", "/v1/orders", order_payload, idempotency_key)
        _logger.debug("mp_order_create(), response from Mercado Pago: %s", resp)
        return resp

    def mp_order_get(self, order_id):
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        resp = mercado_pago.call_mercado_pago("get", f"/v1/orders/{order_id}", {})
        _logger.debug("mp_order_get(), response from Mercado Pago: %s", resp)
        return resp

    def mp_qr_order_create(self, infos):
        self._check_special_access()
        record = self.sudo()
        if not record.mp_external_pos_id:
            raise UserError(_("QR payments require 'POS ID' (external_pos_id) to be configured."))
        mercado_pago = MercadoPagoPosRequest(record.mp_bearer_token)
        amount_str = "{:.2f}".format(infos['amount'] / 100)
        items = [{
            "title": infos.get('title', 'Venta POS'),
            "unit_price": amount_str,
            "quantity": 1,
            "unit_measure": "unit",
            "external_code": "POS-SALE",
        }]
        order_payload = {
            "type": "qr",
            "total_amount": amount_str,
            "description": infos.get('title', 'Venta POS'),
            "external_reference": infos['external_reference'],
            "config": {
                "qr": {"external_pos_id": record.mp_external_pos_id}
            },
            "transactions": {
                "payments": [{"amount": amount_str}]
            },
            "items": items,
        }
        idempotency_key = f"qr_{infos['external_reference']}"
        resp = mercado_pago.call_mercado_pago("post", "/v1/orders", order_payload, idempotency_key)
        _logger.debug("mp_qr_order_create(), response from Mercado Pago: %s", resp)
        return resp

    def mp_qr_order_delete(self):
        self._check_special_access()
        record = self.sudo()
        if not record.mp_user_id or not record.mp_external_pos_id:
            return {}
        mercado_pago = MercadoPagoPosRequest(record.mp_bearer_token)
        endpoint = f"/instore/orders/qr/seller/collectors/{record.mp_user_id}/pos/{record.mp_external_pos_id}/qrs"
        resp = mercado_pago.call_mercado_pago("delete", endpoint, {})
        _logger.debug("mp_qr_order_delete(), response from Mercado Pago: %s", resp)
        return resp or {}

    def mp_get_payment_status(self, payment_id):
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        resp = mercado_pago.call_mercado_pago("get", f"/v1/payments/{payment_id}", {})
        _logger.debug("mp_get_payment_status(), response from Mercado Pago: %s", resp)
        return resp

    def mp_qr_get_merchant_order(self, merchant_order_id):
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        resp = mercado_pago.call_mercado_pago("get", f"/merchant_orders/{merchant_order_id}", {})
        _logger.debug("mp_qr_get_merchant_order(%s), response: %s", merchant_order_id, resp)
        return resp

    def mp_qr_search_merchant_order(self, external_reference):
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        resp = mercado_pago.call_mercado_pago(
            "get", "/merchant_orders/search",
            {"external_reference": external_reference}
        )
        _logger.debug("mp_qr_search_merchant_order(%s), response: %s", external_reference, resp)
        elements = resp.get("elements", [])
        return elements[0] if elements else {}

    def mp_order_cancel(self, order_id):
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        resp = mercado_pago.call_mercado_pago("post", f"/v1/orders/{order_id}/cancel", {})
        _logger.debug("mp_order_cancel(), response from Mercado Pago: %s", resp)
        return resp

    def _find_terminal(self, token, point_smart):
        mercado_pago = MercadoPagoPosRequest(token)
        data = mercado_pago.call_mercado_pago("get", "/terminals/v1/list", {})
        _logger.info("Mercado Pago Devices Response: %s", data)
        terminals = []
        if 'data' in data and isinstance(data['data'], dict) and 'terminals' in data['data']:
            terminals = data['data']['terminals']
        elif 'devices' in data:
            terminals = data['devices']
        if terminals:
            found_device = next((d for d in terminals if point_smart in d['id']), None)
            if not found_device:
                raise UserError(_("The terminal serial number is not registered on Mercado Pago"))
            return found_device.get('id', '')
        raise UserError(_("Please verify your production user token as it was rejected"))

    def action_get_mp_pos_list(self):
        self.ensure_one()
        if not self.mp_bearer_token:
            raise UserError(_("Please configure the Production User Token first."))
        mercado_pago = MercadoPagoPosRequest(self.mp_bearer_token)
        resp = mercado_pago.call_mercado_pago("get", "/pos", {})
        if 'results' in resp and resp['results']:
            if len(resp['results']) == 1:
                pos = resp['results'][0]
                self.mp_external_pos_id = pos.get('external_id')
                if pos.get('qr_code'):
                    self.mp_qr_string = pos.get('qr_code')
                msg = f"Se autocompletó tu caja: {pos.get('name')} (ID: {self.mp_external_pos_id})"
                if not self.mp_external_pos_id:
                    msg += "\n\n⚠️ ATENCIÓN: Tu caja no tiene 'ID Externo'."
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': 'Autocompletado Exitoso' if self.mp_external_pos_id else 'Falta ID Externo',
                        'message': msg,
                        'sticky': not bool(self.mp_external_pos_id),
                        'type': 'success' if self.mp_external_pos_id else 'warning',
                    }
                }
            pos_list = [
                f"- Caja: {p.get('name', 'Sin nombre')}\n  ID Externo: {p.get('external_id', 'SIN_ID_EXTERNO')}\n"
                for p in resp['results']
            ]
            raise UserError(
                "Tenés múltiples cajas. Copiá el ID Externo de la que quieras usar:\n\n" +
                "\n".join(pos_list)
            )
        raise UserError(_("No se encontraron cajas configuradas en esta cuenta de Mercado Pago."))

    def _fetch_mp_user_id(self, token):
        mercado_pago = MercadoPagoPosRequest(token)
        resp = mercado_pago.call_mercado_pago("get", "/users/me", {})
        if 'id' in resp:
            return str(resp['id'])
        _logger.warning("Could not fetch MP user id: %s", resp)
        return False

    def write(self, vals):
        records = super().write(vals)
        for record in self:
            if record.mp_bearer_token:
                if 'mp_id_point_smart' in vals or 'mp_bearer_token' in vals:
                    if record.mp_id_point_smart and record._is_mercado_pago_terminal():
                        record.mp_id_point_smart_complet = record._find_terminal(
                            record.mp_bearer_token, record.mp_id_point_smart)
                if record._is_mercado_pago_qr() and ('mp_bearer_token' in vals or not record.mp_user_id):
                    user_id = record._fetch_mp_user_id(record.mp_bearer_token)
                    if user_id:
                        record.mp_user_id = user_id
        return records

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            if record.mp_bearer_token:
                if record.mp_id_point_smart and record._is_mercado_pago_terminal():
                    record.mp_id_point_smart_complet = record._find_terminal(
                        record.mp_bearer_token, record.mp_id_point_smart)
                if record._is_mercado_pago_qr() and not record.mp_user_id:
                    user_id = record._fetch_mp_user_id(record.mp_bearer_token)
                    if user_id:
                        record.mp_user_id = user_id
        return records
