from odoo import models, fields

class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    interest_margin_pct = fields.Float(
        string='Interest Margin (%)',
        help='Percentage of the payment amount to be added as an interest surcharge.'
    )
    interest_product_id = fields.Many2one(
        'product.product',
        string='Interest Product',
        domain="[('sale_ok', '=', True)]",
        help='The product used to register the interest surcharge in the order lines.'
    )
