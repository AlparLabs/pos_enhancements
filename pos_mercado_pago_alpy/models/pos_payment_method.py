import logging

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError

from .mercado_pago_post_request import MercadoPagoPosRequest

_logger = logging.getLogger(__name__)


class PosPaymentMethod(models.Model):



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
        Create an order using Mercado Pago API.
        Routes to Terminal API or QR API depending on the payment method config.
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        amount_decimal = "{:.2f}".format(infos['amount'] / 100)
        
        if self.mp_payment_type == 'qr':
            user_info = mercado_pago.call_mercado_pago("get", "/users/me", {})
            user_id = user_info.get("id")
            pos_id = self.mp_external_pos_id
            
            if not user_id or not pos_id:
                raise UserError(_("Mercado Pago QR requires POS Initialization. Please click 'Initialize QR POS' in the payment method settings."))
            
            # QR payload
            order_payload = {
                "external_reference": infos['additional_info']['external_reference'],
                "title": f"Odoo POS Order",
                "description": "Order from Odoo POS",
                "total_amount": float(amount_decimal),
                "items": [{
                    "title": "Order Total",
                    "unit_measure": "unit",
                    "quantity": 1,
                    "unit_price": float(amount_decimal),
                    "total_amount": float(amount_decimal)
                }]
            }
            
            # Add sponsor_id if available
            if self.mp_sponsor_id:
                order_payload["sponsor_id"] = int(self.mp_sponsor_id)

            # Add cash_out if available
            if infos['additional_info'].get('cash_out_amount'):
                order_payload["cash_out"] = {
                    "amount": float("{:.2f}".format(infos['additional_info']['cash_out_amount'] / 100))
                }

            # Add expiration_date if available
            if infos['additional_info'].get('expiration_date'):
                order_payload["expiration_date"] = infos['additional_info']['expiration_date']

            # Add additional_info if available
            if infos['additional_info'].get('additional_info'):
                order_payload["additional_info"] = infos['additional_info']['additional_info']

            _logger.info('Calling Mercado Pago to create QR order: %s', order_payload)
            resp = mercado_pago.call_mercado_pago("post", f"/instore/qr/seller/collectors/{user_id}/pos/{pos_id}/orders", order_payload)
            _logger.debug("Mercado Pago QR order creation response: %s", resp)
            return resp
        
        elif self.mp_payment_type == 'terminal':
            # Terminal payload
            terminal_payload = {
                "amount": int(infos['amount']),
                "installments": 1,
                "external_reference": infos['additional_info']['external_reference'],
                "payment_method": {
                    "type": "credit_card" if infos['additional_info']['payment_method_type'] == 'credit' else "debit_card"
                }
            }
            _logger.info('Calling Mercado Pago to create Terminal order: %s', terminal_payload)
            resp = mercado_pago.call_mercado_pago("post", f"/point/integration-api/devices/{self.mp_id_point_smart_complet}/payments", terminal_payload)
            _logger.debug("Mercado Pago Terminal order creation response: %s", resp)
            return resp
        else:
            raise UserError(_("Mercado Pago payment type not configured. Please select 'QR' or 'Terminal' in the payment method settings."))

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

    def write(self, vals):
        records = super().write(vals)
        
        if 'mp_id_point_smart' in vals or 'mp_bearer_token' in vals:
            for record in self:
                if record.mp_bearer_token and record.mp_id_point_smart:
                    record.mp_id_point_smart_complet = record._find_terminal(record.mp_bearer_token, record.mp_id_point_smart)
        return records

    def action_mp_register_qr_pos(self):
        """ Automatically registers the Store and POS in Mercado Pago. """
        self._check_special_access()
        for record in self:
            mercado_pago = MercadoPagoPosRequest(record.sudo().mp_bearer_token)
            
            # Step 1: Get User ID by making a dummy call to /users/me
            user_info = mercado_pago.call_mercado_pago("get", "/users/me", {})
            user_id = user_info.get("id")
            if not user_id:
                raise UserError(_("Could not fetch user_id from Mercado Pago. Check your token."))
            
            store_id = record.mp_external_store_id
            pos_id = record.mp_external_pos_id

            # Step 2: Create Store if empty
            if not store_id:
                store_payload = {
                    "name": self.env.company.name or "Main Store",
                    "location": {
                        "street_number": "123",
                        "street_name": "Main Street",
                        "city_name": "City",
                        "state_name": "State",
                        "latitude": -34.61315,
                        "longitude": -58.37723,
                        "reference": "Store"
                    }
                }
                store_resp = mercado_pago.call_mercado_pago("post", f"/users/{user_id}/stores", store_payload)
                if store_resp.get("id"):
                    store_id = store_resp["id"]
                    record.mp_external_store_id = store_id
                else:
                    raise UserError(_("Failed to create Store in Mercado Pago: %s", store_resp))
                    
            # Step 3: Create POS if empty
            if not pos_id:
                # Odoo's pos.config uses this payment method
                # We can just use the first pos.config that has it, or a generic name.
                pos_configs = self.env['pos.config'].search([('payment_method_ids', 'in', record.id)])
                pos_name = pos_configs[0].name if pos_configs else "Odoo POS"
                external_id = f"odoo_pos_{record.id}_{pos_configs[0].id if pos_configs else '1'}"
                
                pos_payload = {
                    "name": pos_name,
                    "fixed_amount": True,
                    "store_id": int(store_id),
                    "external_store_id": str(store_id),
                    "external_id": external_id,
                    "category": 6211
                }
                pos_resp = mercado_pago.call_mercado_pago("post", "/pos", pos_payload)
                if pos_resp.get("id"):
                    # We store the external_id because the QR API actually needs the external_pos_id
                    record.mp_external_pos_id = external_id
                else:
                    raise UserError(_("Failed to create POS in Mercado Pago: %s", pos_resp))
                    
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Success'),
                    'message': _('Mercado Pago Store and POS initialized successfully!'),
                    'type': 'success',
                }
            }

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)

        for record in records:
            if record.mp_bearer_token:
                record.mp_id_point_smart_complet = record._find_terminal(record.mp_bearer_token, record.mp_id_point_smart)

        return records