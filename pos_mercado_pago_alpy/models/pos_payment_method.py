import logging

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError

from .mercado_pago_post_request import MercadoPagoPosRequest

_logger = logging.getLogger(__name__)


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

    def _is_mercado_pago_terminal(self):
        return self.use_payment_terminal in ('mercado_pago_alpy',)

    def _is_mercado_pago_qr(self):
        return self.use_payment_terminal in ('mercado_pago_qr_local', 'mercado_pago_qr_screen', 'mercado_pago_qr_hybrid')

    def _check_special_access(self):
        if not self.env.user.has_group('point_of_sale.group_pos_user'):
            raise AccessError(_("Do not have access to fetch token from Mercado Pago"))

    def force_pdv(self):
        """
        Triggered in debug mode when the user wants to force the "PDV" mode.
        It calls the Mercado Pago API to set the terminal mode to "PDV".
        """
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
        """
        Create an order using the new Mercado Pago Orders API.
        Called from frontend to initiate a payment on the terminal.
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)

        # Convert amount from cents to decimal string (e.g., 15000 -> "150.00")
        amount_decimal = "{:.2f}".format(infos['amount'] / 100)

        # Build the new order payload for Orders API
        order_payload = {
            "type": "point",
            "external_reference": infos['additional_info']['external_reference'],
            "transactions": {
                "payments": [{
                    "amount": amount_decimal
                }]
            },
            "config": {
                "point": {
                    "terminal_id": self.mp_id_point_smart_complet
                }
            }
        }

        # Generate idempotency key from external_reference for safe retries
        idempotency_key = f"order_{infos['additional_info']['external_reference']}"

        resp = mercado_pago.call_mercado_pago("post", "/v1/orders", order_payload, idempotency_key)
        _logger.debug("mp_order_create(), response from Mercado Pago: %s", resp)
        return resp

    def mp_order_get(self, order_id):
        """
        Get order status using the new Mercado Pago Orders API.
        Called from frontend to check the current status of an order.
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        resp = mercado_pago.call_mercado_pago("get", f"/v1/orders/{order_id}", {})
        _logger.debug("mp_order_get(), response from Mercado Pago: %s", resp)
        return resp

    # ── QR-specific methods ──────────────────────────────────────────────────

    def mp_qr_order_create(self, infos):
        """
        Create a QR payment order using the Mercado Pago Instore QR Orders API.
        Associates the amount with the physical QR code of this POS.

        API endpoint:
          PUT /instore/orders/qr/seller/collectors/{user_id}/pos/{external_pos_id}/qrs
        """
        self._check_special_access()

        record = self.sudo()
        if not record.mp_user_id or not record.mp_external_pos_id:
            raise UserError(_("QR payments require 'Seller User ID' and 'POS ID' to be configured."))

        mercado_pago = MercadoPagoPosRequest(record.mp_bearer_token)

        # Build items list from infos (frontend sends simplified order lines)
        items = infos.get('items', [])
        if not items:
            # Fallback: single generic item
            amount_decimal = round(infos['amount'] / 100, 2)
            items = [{
                "sku_number": "POS-SALE",
                "category": "others",
                "title": infos.get('title', 'POS Sale'),
                "description": infos.get('title', 'POS Sale'),
                "quantity": 1,
                "unit_measure": "unit",
                "unit_price": amount_decimal,
                "total_amount": amount_decimal,
            }]

        amount_decimal = round(infos['amount'] / 100, 2)
        order_payload = {
            "external_reference": infos['external_reference'],
            "title": infos.get('title', 'POS Sale'),
            "description": infos.get('title', 'POS Sale'),
            "total_amount": amount_decimal,
            "items": items,
            "cash_out": {"amount": 0},
        }
        
        if infos.get('notification_url'):
            order_payload["notification_url"] = infos.get('notification_url')

        endpoint = f"/instore/orders/qr/seller/collectors/{record.mp_user_id}/pos/{record.mp_external_pos_id}/qrs"
        resp = mercado_pago.call_mercado_pago("put", endpoint, order_payload)
        _logger.debug("mp_qr_order_create(), response from Mercado Pago: %s", resp)
        return resp

    def mp_qr_order_delete(self):
        """
        Delete (cancel) the current QR order, leaving the QR free for the next transaction.

        API endpoint:
          DELETE /instore/orders/qr/seller/collectors/{user_id}/pos/{external_pos_id}/qrs
        """
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
        """
        Called from frontend to get the payment status from Mercado Pago.
        This endpoint remains unchanged in the new API.
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        resp = mercado_pago.call_mercado_pago("get", f"/v1/payments/{payment_id}", {})
        _logger.debug("mp_get_payment_status(), response from Mercado Pago: %s", resp)
        return resp

    def mp_order_cancel(self, order_id):
        """
        Cancel an order using the new Mercado Pago Orders API.
        Note: Only orders with "created" or "action_required" status can be canceled.
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # New API uses POST to cancel endpoint instead of DELETE
        resp = mercado_pago.call_mercado_pago("post", f"/v1/orders/{order_id}/cancel", {})
        _logger.debug("mp_order_cancel(), response from Mercado Pago: %s", resp)
        return resp

    def _find_terminal(self, token, point_smart):
        """
        Find the terminal ID from Mercado Pago using the new terminals API.
        """
        mercado_pago = MercadoPagoPosRequest(token)
        # Reverting to terminals/v1/list as per user preference/verification
        data = mercado_pago.call_mercado_pago("get", "/terminals/v1/list", {})
        _logger.info("Mercado Pago Devices Response: %s", data)

        # Logic for /terminals/v1/list response structure
        # { "data": { "terminals": [ { "id": "..." } ] } }
        
        terminals = []
        if 'data' in data and isinstance(data['data'], dict) and 'terminals' in data['data']:
             terminals = data['data']['terminals']
        elif 'devices' in data: # Fallback just in case
             terminals = data['devices']

        if terminals:
            # Search for a device id that contains the serial number entered by the user
            found_device = next((device for device in terminals if point_smart in device['id']), None)

            if not found_device:
                raise UserError(_("The terminal serial number is not registered on Mercado Pago"))

            return found_device.get('id', '')
        else:
            raise UserError(_("Please verify your production user token as it was rejected"))

    def action_get_mp_pos_list(self):
        """
        Helper method triggered from the UI to fetch all POS from Mercado Pago.
        If there is only one POS, it auto-fills the 'mp_external_pos_id' and 'mp_qr_string'.
        If there are multiple, it shows the user their available 'external_pos_id's.
        """
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
                    msg += "\n\n⚠️ ATENCIÓN: Tu caja no tiene 'ID Externo'. Debes ir al panel de Mercado Pago y agregarle uno para que funcione."
                    
                return {
                    'type': 'ir.actions.client',
                    'tag': 'display_notification',
                    'params': {
                        'title': 'Autocompletado Exitoso' if self.mp_external_pos_id else 'Falta ID Externo',
                        'message': msg,
                        'sticky': True if not self.mp_external_pos_id else False,
                        'type': 'success' if self.mp_external_pos_id else 'warning',
                    }
                }
            else:
                pos_list = []
                for pos in resp['results']:
                    name = pos.get('name', 'Sin nombre')
                    ext_id = pos.get('external_id', 'SIN_ID_EXTERNO (¡Debes configurarlo en Mercado Pago!)')
                    pos_list.append(f"- Caja: {name}\n  ID Externo: {ext_id}\n")
                
                msg = "Tenés múltiples cajas configuradas. Por favor, copiá el ID Externo de la que quieras usar y pegalo manualmente:\n\n" + "\n".join(pos_list)
                raise UserError(msg)
        else:
            raise UserError(_("No se encontraron cajas configuradas en esta cuenta de Mercado Pago. ¡Debes crear una primero en el panel de Mercado Pago!"))

    def _fetch_mp_user_id(self, token):
        """
        Fetch the Mercado Pago User ID associated with the token.
        """
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
                        record.mp_id_point_smart_complet = record._find_terminal(record.mp_bearer_token, record.mp_id_point_smart)
                
                # Fetch User ID automatically for QR modes if not set or token changed
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
                    record.mp_id_point_smart_complet = record._find_terminal(record.mp_bearer_token, record.mp_id_point_smart)
                
                if record._is_mercado_pago_qr() and not record.mp_user_id:
                    user_id = record._fetch_mp_user_id(record.mp_bearer_token)
                    if user_id:
                        record.mp_user_id = user_id

        return records