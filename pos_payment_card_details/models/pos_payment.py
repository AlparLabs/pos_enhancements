from odoo import models, fields

class PosPayment(models.Model):
    _inherit = 'pos.payment'

    lot_number = fields.Char(string='Lot Number', help='Terminal Lot Number for conciliation')
    coupon_number = fields.Char(string='Coupon Number', help='Terminal Coupon Number for conciliation')
    installments = fields.Integer(string='Installments', help='Number of installments for the payment', default=1)

    def _load_pos_data_fields(self, config_id):
        data_fields = super()._load_pos_data_fields(config_id)
        data_fields += ['lot_number', 'coupon_number', 'installments']
        return data_fields
