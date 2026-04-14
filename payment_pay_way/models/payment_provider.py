from odoo import fields, models, api, _
from odoo.exceptions import UserError
from odoo.addons.payment_pay_way import const

import logging
import requests

_logger = logging.getLogger(__name__)


class PaymentProvider(models.Model):
    _inherit = 'payment.provider'

    code = fields.Selection(
        selection_add=[('payway', 'Payway')],
        ondelete={'payway': 'set default'}
    )
    payway_commerce = fields.Char(
        string='N. commerce',
    )
    payway_public_key = fields.Char(
        string='Public Api Key',
    )
    payway_secret_key = fields.Char(
        string='Api Key',
    )
    payway_cybersource = fields.Boolean(
        'CyberSource'
    )
    payway_channel = fields.Char()
    payway_item_code = fields.Char()
    payway_item_description = fields.Char()
    payway_item_name = fields.Char()
    payway_item_sku = fields.Char()
    product_surcharge_id = fields.Many2one(
        'product.product',
        'Product for use in financial surcharge',
        related='company_id.product_surcharge_id',
        readonly=False
    )

    def _should_build_inline_form(self, is_validation=False):
        if self.code != 'payway':
            return super()._should_build_inline_form(is_validation=is_validation)
        return True

    @api.depends('provider', 'inline_form_view_id')
    def _set_default_form_provider(self):
        if self.code == 'payway' and not self.inline_form_view_id:
            self.inline_form_view_id = self.env.ref('payment_pay_way.inline_form').id

    # === COMPUTE METHODS === #

    def _compute_feature_support_fields(self):
        """ Override of `payment` to enable additional features. """
        super()._compute_feature_support_fields()
        self.filtered(lambda p: p.code == 'payway').update({
            'support_refund': 'partial',
        })

    # === BUSINESS METHODS === #

    def _get_default_payment_method_codes(self):
        """ Override of `payment` to return the default payment method codes. """
        default_codes = super()._get_default_payment_method_codes()
        if self.code != 'payway':
            return default_codes
        return const.DEFAULT_PAYMENT_METHODS_CODES

    def _get_supported_currencies(self):
        """ Override of `payment` to return the supported currencies. """
        supported_currencies = super()._get_supported_currencies()
        if self.code == 'payway':
            supported_currencies = supported_currencies.filtered(
                lambda c: c.name in const.SUPPORTED_CURRENCIES
            )
        return supported_currencies

    # === PAYWAY METHODS === #

    def payway_get_base_url(self):
        self.ensure_one()

        if self.state == 'enabled':
            return const.PROD_BASE_API_URL
        elif self.state == 'test':
            return const.TEST_BASE_API_URL
        else:
            raise UserError(_("Decidir is disabled"))

    def payway_healthcheck(self):
        api_url = self. payway_get_base_url() + '/healthcheck'
        response = requests.get(api_url, data={})
        if response.status_code == 200:
            return response.json()
            # to do oki?
        else:
            raise UserError(_("Decidir healthcheck error"))

    def payway_get_headers(self):
        return {
            'apikey': self.payway_secret_key,
            'content-type': "application/json",
            'cache-control': "no-cache"
        }

    def payway_cancel_refund(self, payment_id, refund_id):
        # merchantId
        api_url = self.payway_get_base_url() + '/payments/%i/refunds/%i' % (payment_id, refund_id)
        headers = self.payway_get_headers()
        payload = '{}'
        response = requests.delete(api_url, data=payload, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            raise UserError(_("No puedo recuperar este pago"))

    def payway_refund_payment(self, payment_id, amount=0):
        # merchantId
        api_url = self.payway_get_base_url() + '/payments/' + str(payment_id) + '/refunds'
        headers = self.payway_get_headers()
        payload = '{}'
        if (amount):
            payload = '{"amount": %i}' % int(amount * 100)

        response = requests.post(api_url, data=payload, headers=headers)
        if response.status_code == 201:
            return response.json()
        if response.status_code == 400:
            res = response.json()
            raise UserError("ERROR \n" + str(res))
        else:
            raise UserError(_("No puedo devolver este pago"))

    def payway_get_payment_info(self, payment_id):
        # merchantId
        api_url = self.payway_get_base_url() + '/payments/' + str(payment_id)
        headers = self.payway_get_headers()
        payload = {}
        response = requests.get(api_url, params=payload, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            raise UserError(_("No puedo recuperar este pago"))

    def payway_get_payments(self, dateFrom=False, dateTo=False, siteOperationId=False, offset=0):
        api_url = self.payway_get_base_url() + '/payments'
        headers = self.payway_get_headers()
        payload = {
            'pageSize': 50,
            'offset': 0,
        }
        if (dateFrom):
            payload['dateFrom'] = dateFrom
        if (dateTo):
            payload['dateTo'] = dateTo
        if (siteOperationId):
            payload['siteOperationId'] = siteOperationId
        response = requests.get(api_url, params=payload, headers=headers)
        if response.status_code == 200:
            return response.json()
        else:
            raise UserError(_("No puedo recuperar este pago"))

    def payway_card_installment_tree(self, net_amount=0):
        installment_ids = self.env['account.card.installment'].search([
            ('card_id.payway_method', '!=', False),
            ('card_id.company_id', '=', self.company_id.id),
        ])
        return installment_ids.card_installment_tree(net_amount)
