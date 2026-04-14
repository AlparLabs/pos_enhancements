from typing import Any
from odoo import models

class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _payment_fields(self, order: Any, ui_paymentline: dict[str, Any]) -> dict[str, Any]:
        payment_fields = super()._payment_fields(order, ui_paymentline)
        payment_fields.update({
            'lot_number': ui_paymentline.get('lot_number'),
            'coupon_number': ui_paymentline.get('coupon_number'),
            'installments': ui_paymentline.get('installments') or 1,
        })
        return payment_fields
