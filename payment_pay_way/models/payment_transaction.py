from odoo import fields, models, api, _
from odoo.exceptions import UserError
import json
import logging
import requests
import re
from odoo.addons.phone_validation.tools.phone_validation import phone_format

from odoo.addons.payment_pay_way.utils import payway_sum_amounts
from odoo.addons.payment_pay_way import const

_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    payway_payment_id = fields.Integer(
        string='payway identification',
    )
    payway_payment_method = fields.Selection(
        const.PAYWAY_METHODS,
        string='Payment method'
    )
    payway_payment_instalment = fields.Integer(
        string='Instalment'
    )
    payway_ticket = fields.Char(
        string='Ticket',
    )
    payway_card_authorization_code = fields.Char(
        string='Card Authorization code',
    )
    payway_address_validation_code = fields.Char(
        string='Address validation code',
    )
    payway_fees = fields.Monetary()

    # Este codigo queda comentado porque no activamos tokens en esta version
    # def _send_payment_request(self):
    #     """ Override of payment to send a payment request to paywat.
    #         This method handles payments from token (w/ CVV) or from subscriptions (w/o CVV)

    #     Note: self.ensure_one()

    #     :return: None
    #     :raise: UserError if the transaction is not linked to a token
    #     """
    #     super()._send_payment_request()
    #     if self.provider_code != 'payway':
    #         return
    #     token = self.token_id.payway_require_token()
    #     kwars = {
    #         'send_customer': True,
    #         'token': token['id'],
    #         'bin': self.token_id.payway_bin,
    #         'payway_payment_method': self.token_id.payway_payment_method,
    #         'payway_payment_instalment': self.token_id.payway_instalment,
    #     }
    #     result = self.payway_send_payment(kwars)
    #     self._process_notification_data({'reference': self.reference, 'response': result})

    def payway_get_payment_info(self):
        rtn_txt = ''
        for transaction in self.filtered(lambda t: t.provider_code == 'payway'):
            if transaction.payway_payment_id:
                transaction_info = transaction.provider_id.payway_get_payment_info(
                    transaction.payway_payment_id)
            elif transaction.reference:
                transaction_info = transaction.provider_id.payway_get_payments(
                    siteOperationId=transaction.reference)
                transaction_info = transaction_info['results'][0]

            if 'only_show_data' in self.env.context:
                for item in transaction_info:
                    rtn_txt += "%s: %s\n" % (item, transaction_info[item])
            else:
                transaction.set_payway_data(transaction_info)
                if transaction_info['status'] == 'annulled' \
                   and transaction.state in ['draft', 'authorized', 'done']:
                    transaction.mapped('payment_id').cancel()
                    transaction.write(
                        {'state': 'cancel', 'date': fields.Datetime.now()})
                    transaction._log_payment_transaction_received()

        if 'only_show_data' in self.env.context:
            raise UserError(rtn_txt)

    def _payway_get_error(self, response):
        if 'error' in response:
            return response.get('error', {}).get('reason', {}).get('description', 'Error en la transaccion')

    def payway_send_payment(self, kwargs):
        # https://developers.payway.com.ar/docs/gateway/8tsm3z00obqvs-ejecucion-del-pago-cs-para-retail
        self.ensure_one()
        company_name = re.sub(r'\W+', '', self.provider_id.company_id.name)[:10].lower()

        payload = {
            'site_transaction_id': 'dev' + self.reference[:40],
            'token': kwargs['token'],
            'payment_method_id': int(kwargs['payway_payment_method']),
            'bin': kwargs['bin'],
            'amount': payway_sum_amounts(self.amount),
            'currency': self.currency_id.name,
            'installments': int(kwargs['payway_payment_instalment']),
            'payment_type': 'single',
            'establishment_name': company_name,
            'email': self.partner_id.email,
            'sub_payments': [],
        }

        if self.provider_id.payway_cybersource:
            payload['fraud_detection'] = {
                'send_to_cs': True,
                'channel': self._get_payway_channel(),
                'bill_to': self._payway_map_bill_to(),
                'purchase_totals': {
                    'currency': self.currency_id.name,
                    'amount': payway_sum_amounts(self.amount),
                },
                'retail_transaction_data': self._payway_map_retail_transaction_data()
            }

        # add token request
        if (self.tokenize and not self.token_id) or kwargs.get('send_customer'):
            payload['customer'] = {
                    "id": 'odoo_dev_' + str(self.partner_id.id),
                    "email": str(self.partner_id.email)
            }
        payload = json.dumps(payload, indent=None)
        api_url = self.provider_id.payway_get_base_url() + '/payments'
        headers = self.provider_id.payway_get_headers()
        response = requests.post(api_url, data=payload, headers=headers)
        if response.status_code in [200, 201]:
            return response.json()
        else:
            _logger.error("PAYWAY ERROR: %s in payload(%s)" % (response.text, payload))
            response_json = response.json()
            json_error = []

            if response_json and response_json.get('status_details', {}).get('error', {}).get('reason'):
                reason = response_json.get('status_details', {}).get('error', {}).get('reason', {})
                json_error += [{'id': reason.get('id'), 'param': reason.get('description')}]

            if response_json and response_json.get('validation_errors'):
                json_error += response_json.get('validation_errors')

            if response_json and response_json.get('fraud_detection', {}).get('status', {}).get('details', {}).get('validation_errors'):
                json_error += response_json.get('fraud_detection', {}).get('status', {}).get('details', {}).get('validation_errors')

            if json_error:
                errors = ''
                for error in json_error:
                    # TODO: Human readable error
                    try:
                        if type(error) == dict and error.get('code') == 'invalid_param':
                            errors += const.PAYWAY_INVALID_PARAMS.get(error.get('param'))
                        elif type(error) == dict:
                            errors += const.PAYWAY_ERRORS.get(error.get('code'), "{param}").format(**error)
                        else:
                            errors += str(error)
                    except:
                        errors += str(error)
                self._set_error(errors)
                _logger.error(response.text)
            elif 'id' not in response_json and 'message' in response_json:
                self._set_error(response_json['message'])
                self._cr.commit()
                raise UserError(response_json['message'])
            else:
                self._set_error(self._payway_get_error(response_json))

            return response_json

    @api.model
    def _get_tx_from_notification_data(self, provider_code, notification_data):
        if provider_code != 'payway':
            return super()._get_tx_from_notification_data(provider_code, notification_data)
        return self.sudo().search([('reference', '=', notification_data['reference'])])

    def _process_notification_data(self, notification_data):
        self.ensure_one()
        super()._process_notification_data(notification_data)

        if self.provider_id.code != 'payway':
            return
        response = notification_data['response']
        if 'id' not in response:
            self._set_error('Cant process payment')
        self.payway_payment_id = int(response.get('id', 0))
        self.provider_reference = str(response.get('id'))
        self.payway_payment_method = str(response.get('payment_method_id')) if response.get('payment_method_id') else False
        self.payway_payment_instalment = response.get('installments')
        if response.get('status_details') and len(response['status_details']):
            self.payway_card_authorization_code = response['status_details'].get('card_authorization_code')
            self.payway_ticket = response['status_details']['ticket']
            self.payway_address_validation_code = response['status_details'].get('address_validation_code')
        if response.get('status') == 'approved':
            payment_method_type = 'payway'
            payment_method = self.env['payment.method']._get_from_code(
                payment_method_type, mapping=const.PAYMENT_METHODS_MAPPING
            )
            # Fall back to "unknown" if the payment method is not found (and if "unknown" is found), as
            # the user might have picked a different payment method than on Odoo's payment form.
            if not payment_method:
                payment_method = self.env['payment.method'].search([('code', '=', 'unknown')], limit=1)
            self.payment_method_id = payment_method or self.payment_method_id
            self._set_done()
        if self.tokenize and not self.token_id:
            self.payway_add_token(response)

    def payway_add_token(self, data):
        api_url = self.provider_id.payway_get_base_url() + '/usersite/%s/cardtokens' % data['customer']['id']
        headers = self.provider_id.payway_get_headers()
        payload = {}
        response = requests.get(api_url, params=payload, headers=headers)
        if response.status_code == 200:
            #todo Filtrar
            response_data = response.json()
            for token_info in response_data['tokens']:
                if token_info['token'] == data['customer_token']:
                    method_name = [x[1] for x in const.PAYWAY_METHODS if x[0] == str(token_info['payment_method_id'])][0]
                    token = {
                        'payment_details': "%s terminada en %s" % (method_name, token_info['last_four_digits']),
                        'partner_id': self.partner_id.id,
                        'provider_id': self.provider_id.id,
                        'provider_ref': token_info['token'],
                        'payment_method_id': self.payment_method_id.id,
                        'payway_payment_method': str(token_info['payment_method_id']),
                        'payway_bin': str(token_info['bin']),
                        'payway_last_four_digits': str(token_info['last_four_digits']),
                        'active': True,
                    }
                    self.env['payment.token'].sudo().create(token)

    def _payway_create_transaction_request(self, kwargs):
        self.ensure_one()
        return self.payway_send_payment(kwargs)

    def _send_refund_request(self, amount_to_refund=None, create_refund_transaction=True):
        """ Override of payment to send a refund request to payway.

        Note: self.ensure_one()

        :param float amount_to_refund: The amount to refund
        :param bool create_refund_transaction: Whether a refund transaction should be created or not
        :return: The refund transaction if any
        :rtype: recordset of `payment.transaction`
        """
        self.ensure_one()
        res = super()._send_refund_request(
                amount_to_refund=amount_to_refund,
                create_refund_transaction=create_refund_transaction,
            )
        if self.provider_code == 'payway':
            if self.operation != 'refund':
                payment_id = res.source_transaction_id.payway_payment_id
                new_tx = self.provider_id.payway_refund_payment(payment_id, amount=float(amount_to_refund))

                res.provider_reference = str(new_tx['id'])
                res.payway_payment_id = int(new_tx['id'])
                res.payway_payment_method = res.source_transaction_id.payway_payment_method

                if new_tx['status_details'] and len(new_tx['status_details']):
                    res.payway_card_authorization_code = new_tx['status_details']['card_authorization_code']
                    res.payway_ticket = new_tx['status_details']['ticket']

                res._set_done()
            else:
                payment_id = res.source_transaction_id.source_transaction_id.payway_payment_id
                refund_id = res.source_transaction_id.payway_payment_id
                new_tx = self.provider_id.payway_cancel_refund(payment_id, refund_id)
                _logger.info(new_tx)
                res._set_done()
        return res

    def _set_done(self):
        def get_invoice_vals(invoice_id):
            return {
                'date': fields.Datetime.today(),
                'invoice_date': fields.Datetime.today(),
                'invoice_origin': _('Payment transaction %s') % self.external_id,
                'journal_id': invoice_id.journal_id.id,
                'invoice_user_id': invoice_id.user_id.id,
                'partner_id': invoice_id.partner_id.id,
                'move_type': 'in_invoice',
            }
        payway_fees_tx = self.filtered(lambda p: p.provider_code == 'payway' and p.payway_fees)
        if len(payway_fees_tx):
            product = self.company_id.product_surcharge_id
            if not product:
                _logger.warning(
                    _("To validate payment with payway  is necessary to have a product surcharge in the "
                      "company of the payment transaction. Please check this in the Account Config"))
                return super()._set_done()
            for tx in payway_fees_tx:
                product_line_created = False
                sale_installed = hasattr(tx, 'sale_order_ids')
                taxes = product.taxes_id.filtered(lambda t: t.company_id.id == tx.provider_id.journal_id.company_id.id)
                amount_total = taxes.filtered(lambda x: not x.price_include).with_context(force_price_include=True).compute_all(
                    tx.payway_fees, currency=self.currency_id)['total_excluded']
                if sale_installed and len(tx.sale_order_ids.filtered(lambda so: so.state in ('draft', 'sent', 'sale'))):
                    order_ids = tx.sale_order_ids.filtered(lambda so: so.state in ('draft', 'sent', 'sale'))
                    taxes = product.taxes_id.filtered(lambda t: t.company_id.id == tx.provider_id.journal_id.company_id.id)
                    order_ids[0].write({'order_line': [(0, 0, {
                        'product_id': product.id,
                        'name': product.display_name,
                        'price_unit': amount_total,
                        'tax_id': [(6, 0, taxes.ids)],
                    })]})
                    product_line_created = True

                elif not product_line_created and len(tx.invoice_ids):
                    draft_invoices = tx.invoice_ids.filtered(lambda inv: inv.state == 'draft')
                    if draft_invoices:
                        draft_invoices[0].write({'invoice_line_ids': [(0, 0, {
                            'product_id': product.id,
                            'price_unit': amount_total,
                            'tax_ids': [(6, 0, taxes.ids)],
                        })]})
                    else:
                        invoice_id = tx.invoice_ids[0]
                        debit_note = {
                            'date': fields.Datetime.today(),
                            'invoice_date': fields.Datetime.today(),
                            'invoice_origin': _('Payment transaction %s') % tx.reference,
                            'journal_id': invoice_id.journal_id.id,
                            'invoice_user_id': invoice_id.user_id.id,
                            'partner_id': invoice_id.partner_id.id,
                            'debit_origin_id': invoice_id.id,
                            'move_type': 'out_invoice',
                            'invoice_line_ids': [(0, 0, {
                                'product_id': product.id,
                                'price_unit': amount_total,
                                'tax_ids': [(6, 0, taxes.ids)],
                            })]
                        }
                        invoice = self.env['account.move'].with_company(tx.provider_id.journal_id.company_id).create(debit_note)
                        tx.invoice_ids = [(4, invoice.id)]
                        invoice.action_post()
        return super()._set_done()

    def _payway_map_retail_transaction_data(self):
        self.ensure_one()
        retail_transaction_data = {'ship_to': self._payway_map_retail_transaction_data_ship_to()}
        # 'days_to_delivery': '2',
        # 'dispatch_method': 'storepickup',
        # 'tax_voucher_required': True,
        # 'customer_loyality_number': '',
        # 'coupon_code': '',
        retail_transaction_data['items'] = []
        retail_transaction_data['items'] += self._payway_map_retail_transaction_items()
        return retail_transaction_data

    def _payway_map_retail_transaction_data_ship_to(self):
        return {
            'city': self.partner_city or '',
            'country': self.partner_id.country_id.code,
            'customer_id': 'odoo_dev_' + str(self.partner_id.id),
            'email': self.partner_id.email,
            'first_name': self.partner_id.name,
            'last_name': self.partner_id.name,
            'phone_number': self._payway_get_partner_phone(self.partner_id),
            'postal_code': self.partner_id.zip or '',
            'state': self.partner_id.state_id.code or '',
            'street1': self.partner_id.street or '',
            'street2': self.partner_id.street2 or '',
        }

    def _payway_map_bill_to(self):
        return {
                'customer_id': 'odoo_' + str(self.partner_id.id),
                'email': self.partner_id.email,
                'first_name': self.partner_id.name,
                'last_name': self.partner_id.name,
                'phone_number': self._payway_get_partner_phone(self.partner_id) or '',
                'postal_code': self.partner_id.zip or '',
                'country': self.partner_id.country_id.code,
                'state': self.partner_id.state_id.code or '',
                'city': self.partner_city or '',
                'street1': self.partner_id.street or '',
                'street2': self.partner_id.street2 or '',
        }

    def _payway_map_retail_transaction_items(self):
        return [{
            'code': self.provider_id.payway_item_code,
            'description': self.provider_id.payway_item_description,
            'name': self.provider_id.payway_item_name,
            'sku': self.provider_id.payway_item_sku,
            'total_amount': payway_sum_amounts(self.amount),
            'quantity': 1,
            'unit_price': payway_sum_amounts(self.amount)
        }]

    def _payway_get_partner_phone(self, partner_id):
        # Por defecto los telefonos se validan por transacciones
        default_country = self.env.ref('base.ar')
        if partner_id.phone:
            return phone_format(
                    partner_id.phone,
                    partner_id.country_id.code if partner_id.country_id else default_country.code,
                    partner_id.country_id.phone_code if partner_id.country_id else default_country.phone_code,
                    force_format='E164',
                    raise_exception=False
                )
        if partner_id.mobile:
            return phone_format(
                    partner_id.mobile,
                    partner_id.country_id.code if partner_id.country_id else default_country.code,
                    partner_id.country_id.phone_code if partner_id.country_id else default_country.phone_code,
                    force_format='E164',
                    raise_exception=False
                )
        return partner_id.phone or ''

    def _get_payway_channel(self):
        return self.provider_id.payway_channel
