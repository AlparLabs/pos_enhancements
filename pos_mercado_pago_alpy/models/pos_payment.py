from odoo import fields, models


class PosPayment(models.Model):
    _inherit = 'pos.payment'

    mp_payment_id = fields.Char(
        string='MP Payment ID',
        help='Mercado Pago payment identifier, captured when the payment is approved.',
    )
    mp_external_reference = fields.Char(
        string='MP External Reference',
        help='External reference sent to Mercado Pago when the payment was requested. '
             'Used to look the payment up when the payment id is not available.',
    )
