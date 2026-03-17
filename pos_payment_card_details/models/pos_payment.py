from odoo import models, fields

class PosPayment(models.Model):
    _inherit = 'pos.payment'

    lot_number = fields.Char(string='Lot Number', help='Terminal Lot Number for conciliation')
    coupon_number = fields.Char(string='Coupon Number', help='Terminal Coupon Number for conciliation')
    installments = fields.Integer(string='Installments', help='Number of installments for the payment', default=1)
