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

    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [('mercado_pago_alpy', 'Mercado Pago Alpy')]

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
                    "amount": amount_decimal,
                    "print_on_terminal": infos['additional_info'].get('print_on_terminal', True)
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

    def write(self, vals):
        records = super().write(vals)

        if 'mp_id_point_smart' in vals or 'mp_bearer_token' in vals:
            self.mp_id_point_smart_complet = self._find_terminal(self.mp_bearer_token, self.mp_id_point_smart)

        return records

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)

        for record in records:
            if record.mp_bearer_token:
                record.mp_id_point_smart_complet = record._find_terminal(record.mp_bearer_token, record.mp_id_point_smart)

        return records