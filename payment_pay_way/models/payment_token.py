from odoo import fields, models, api
from odoo.addons.payment_pay_way import const
from odoo.exceptions import UserError

import requests
import json


import logging

_logger = logging.getLogger(__name__)


class PaymentToken(models.Model):
    _inherit = 'payment.token'

    payway_payment_method = fields.Selection(const.PAYWAY_METHODS)
    payway_bin = fields.Char()
    payway_instalment = fields.Integer(default=1)
    payway_last_four_digits = fields.Char()

    def payway_require_token(self):
        self.ensure_one()
        api_url = self.provider_id.payway_get_base_url() + '/tokens'
        headers = self.provider_id.payway_get_headers()
        payload = {
            'token': self.provider_ref
        }
        payload = json.dumps(payload, indent=None)
        response = requests.post(api_url, data=payload, headers=headers)
        if response.status_code == 200:
            response.json()
        else:
            _logger.error(response.text)
            raise UserError("No puedo generar el token de pago")

    def _build_display_name(self, *args, max_length=34, should_pad=True, **kwargs):
        payway_token = self.filtered(lambda x: x.provider_code == 'payway')
        if payway_token:
            return f'{self.payment_method_id.display_name} terminado en {self.payway_last_four_digits}'
        return super()._build_display_name(*args, max_length=max_length, should_pad=should_pad, **kwargs)
