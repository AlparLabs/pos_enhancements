from odoo import models, fields

class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    use_terminal_details = fields.Boolean(
        string='Requires Card Details',
        help='If checked, the POS will ask for Lot Number, Coupon, and Installments when using this payment method.'
    )
