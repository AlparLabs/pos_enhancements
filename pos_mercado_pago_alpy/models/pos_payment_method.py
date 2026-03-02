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
        help="Enter your Point Smart terminal serial number written on the back of your terminal.")
    mp_id_point_smart_complet = fields.Char()
    
    mp_payment_type = fields.Selection([
        ('terminal', 'Point Smart Terminal'),
        ('qr', 'Dynamic QR Code')
    ], string="Mercado Pago Payment Type", default='terminal')
    mp_external_store_id = fields.Char(string="Mercado Pago Store ID", 
                                       help="Will be auto-filled if empty when clicking Initialize QR POS.")
    mp_external_pos_id = fields.Char(string="Mercado Pago POS ID", 
                                     help="Will be auto-filled if empty when clicking Initialize QR POS.")

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

            _logger.info('Calling Mercado Pago to create Dynamic QR order: %s', order_payload)
            _logger.warning("DEBUG QR Creation details - User ID: [%s], POS External ID: [%s]", user_id, pos_id)
            # The dynamic QR endpoint returns the qr_data needed for the frontend display
            resp = mercado_pago.call_mercado_pago("post", f"/instore/orders/qr/seller/collectors/{user_id}/pos/{pos_id}/qrs", order_payload)
            _logger.debug("Mercado Pago Dynamic QR order creation response: %s", resp)
            return resp
        
        elif self.mp_payment_type == 'terminal':
            # Terminal payload
            terminal_payload = {
                "amount": int(infos['amount']),
                "installments": 1,
                "external_reference": infos['additional_info']['external_reference'],
                "payment_method": {
                    "type": "credit_card" if infos['additional_info'].get('payment_method_type', 'credit') == 'credit' else "debit_card"
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

    def mp_qr_status_get(self, external_reference):
        """
        Get payment status for a QR code using the external_reference.
        Called from frontend while polling the QR code popup.
        """
        self._check_special_access()
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # Search for payments matching this external reference
        resp = mercado_pago.call_mercado_pago("get", f"/v1/payments/search", {"external_reference": external_reference})
        _logger.debug("mp_qr_status_get(), response from Mercado Pago: %s", resp)
        
        # We only care about the results array
        if resp and 'results' in resp:
            return {"elements": resp["results"]}
        return {"elements": []}

    def mp_order_cancel(self, order_id):
        """
        Cancel an order using the new Mercado Pago Orders API.
        Note: Only orders with "created" or "action_required" status can be canceled.
        """
        self._check_special_access()

        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        # New API uses POST to cancel endpoint instead of DELETE
        resp = mercado_pago.call_mercado_pago("post", f"/v1/orders/{order_id}/cancel", {})

    def _find_terminal(self, token, point_smart):
        """
        Queries Mercado Pago for devices associated with the token.
        """
        mercado_pago = MercadoPagoPosRequest(token)

        resp = mercado_pago.call_mercado_pago("get", "/point/integration-api/devices", {"limit": 50})
        _logger.debug("Terminal search response: %s", resp)

        if resp.get('devices'):
            # Looking for the specific terminal ID
            find_terminal = [x for x in resp.get('devices') if x.get('id') == point_smart]
            if len(find_terminal) > 0:
                terminal_data = find_terminal[0]
                if terminal_data.get('operating_mode') != 'PDV':
                    mode = {"operating_mode": "PDV"}
                    resp_mode = mercado_pago.call_mercado_pago("patch", f"/point/integration-api/devices/{terminal_data.get('id')}", mode)
                    if resp_mode.get('operating_mode') != 'PDV':
                        _logger.error("Failed to set terminal mode to PDV. Response: %s", resp_mode)
                return True
            else:
                _logger.warning("Terminal %s not found in the list of devices.", point_smart)
        else:
            _logger.error("Failed to retrieve devices from Mercado Pago. Response: %s", resp)

        return False

    def _ensure_store_and_pos(self, mercado_pago):
        """
        Checks if Store and POS exist for the company/config.
        Searches Mercado Pago first by external_id. If missing, creates them.
        Ensures the POS is strictly linked to the Store.
        """
        user_info = mercado_pago.call_mercado_pago("get", "/users/me", {})
        user_id = user_info.get("id")
        if not user_id:
            raise UserError(_("Could not fetch user_id from Mercado Pago. Check your Production Token."))

        pos_config = self.env['pos.config'].search([], limit=1)
        company = pos_config.company_id if pos_config else self.env.company

        # 1. Ensure Store
        store_ext_id = f"odoo_store_{company.id}"
        internal_store_id = None
        
        search_store = mercado_pago.call_mercado_pago("get", f"/users/{user_id}/stores/search", {"external_id": store_ext_id})
        if search_store and search_store.get('results') and len(search_store['results']) > 0:
            self.mp_external_store_id = str(search_store['results'][0].get('external_id', store_ext_id))
            internal_store_id = int(search_store['results'][0]['id'])
        else:
            store_payload = {
                "name": company.name or "Odoo Store",
                "location": {
                    "street_number": "1",
                    "street_name": company.street or "Unknown",
                    "city_name": company.city or "Unknown",
                    "state_name": company.state_id.name if company.state_id else "Unknown",
                    "latitude": 0,
                    "longitude": 0,
                    "reference": "Odoo Store"
                },
                "external_id": store_ext_id
            }
            resp_store = mercado_pago.call_mercado_pago("post", f"/users/{user_id}/stores", store_payload)
            _logger.debug("Store creation response: %s", resp_store)
            
            if resp_store and 'id' in resp_store:
                self.mp_external_store_id = str(resp_store.get('external_id', store_ext_id))
                internal_store_id = int(resp_store['id'])
            else:
                raise UserError(_("Failed to create Store in Mercado Pago: %s", resp_store))

        # 2. Ensure POS
        pos_ext_id = f"odoo_pos_{pos_config.id if pos_config else 1}"
        search_pos = mercado_pago.call_mercado_pago("get", "/pos", {"external_id": pos_ext_id})
        
        if search_pos and search_pos.get('results') and len(search_pos['results']) > 0:
            self.mp_external_pos_id = str(search_pos['results'][0].get('external_id', pos_ext_id))
            internal_pos_id = str(search_pos['results'][0]['id'])
            # The previous POS might have been orphaned due to string store_id. Force an update to link it.
            update_payload = {"store_id": internal_store_id}
            mercado_pago.call_mercado_pago("put", f"/pos/{internal_pos_id}", update_payload)
            _logger.info("Updated existing orphaned POS [%s] to link to store [%s]", internal_pos_id, internal_store_id)
        else:
            pos_payload = {
                "name": pos_config.name if pos_config else "Odoo POS",
                "fixed_amount": True,
                "store_id": internal_store_id,  # MUST BE INTEGER
                "external_store_id": self.mp_external_store_id,
                "external_id": pos_ext_id,
                "category": 6211
            }
            resp_pos = mercado_pago.call_mercado_pago("post", "/pos", pos_payload)
            _logger.debug("POS creation response: %s", resp_pos)
            
            if resp_pos and 'id' in resp_pos:
                self.mp_external_pos_id = str(resp_pos.get('external_id', pos_ext_id))
            else:
                raise UserError(_("Failed to create POS in Mercado Pago: %s", resp_pos))

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('use_payment_terminal') == 'mercado_pago_alpy':
                if not vals.get('mp_bearer_token'):
                    raise UserError(_("Please configure the PRODUCTION USER TOKEN"))
                if vals.get('mp_payment_type') == 'terminal':
                    if not vals.get('mp_id_point_smart'):
                        raise UserError(_("Please configure the TERMINAL S/N"))
                    if not self._find_terminal(vals.get('mp_bearer_token'), vals.get('mp_id_point_smart').strip()):
                        raise UserError(_("Terminal (%s) not found for this PRODUCTION USER TOKEN") % vals.get('mp_id_point_smart'))
                    vals['mp_id_point_smart_complet'] = "PDV_" + vals.get('mp_id_point_smart').strip()
        return super().create(vals_list)

    def write(self, vals):
        for rec in self:
            if vals.get('use_payment_terminal', rec.use_payment_terminal) == 'mercado_pago_alpy':
                if vals.get('mp_payment_type', rec.mp_payment_type) == 'terminal':
                    mp_id_point_smart = vals.get('mp_id_point_smart', rec.mp_id_point_smart)
                    if not mp_id_point_smart:
                        raise UserError(_("Please configure the TERMINAL S/N"))
                    if 'mp_id_point_smart' in vals or 'mp_bearer_token' in vals:
                        token = vals.get('mp_bearer_token', rec.mp_bearer_token)
                        if not rec._find_terminal(token, mp_id_point_smart.strip()):
                            raise UserError(_("Terminal (%s) not found for this PRODUCTION USER TOKEN") % mp_id_point_smart)
                        vals['mp_id_point_smart_complet'] = "PDV_" + mp_id_point_smart.strip()
                elif vals.get('mp_payment_type', rec.mp_payment_type) == 'qr':
                    pass
        return super().write(vals)

    def action_mp_register_qr_pos(self):
        """
        Manually trigger the Store and POS creation from the UI button.
        """
        self.ensure_one()
        if not self.mp_bearer_token:
            raise UserError(_("Please configure the PRODUCTION USER TOKEN first."))
        mercado_pago = MercadoPagoPosRequest(self.sudo().mp_bearer_token)
        self._ensure_store_and_pos(mercado_pago)
        if self.mp_external_store_id and self.mp_external_pos_id:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Success'),
                    'message': _('QR Store and POS were initialized successfully!'),
                    'type': 'success',
                    'sticky': False,
                }
            }
        else:
            raise UserError(_("Store and POS could not be fully initialized. Please test your API credentials or review the Odoo Log."))

    def _get_payment_terminal_selection(self):
        return super()._get_payment_terminal_selection() + [('mercado_pago_alpy', 'Mercado Pago Alpy')]