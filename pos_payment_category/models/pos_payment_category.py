# -*- coding: utf-8 -*-
from odoo import models, fields, api

class PosPaymentCategory(models.Model):
    _name = 'pos.payment.category'
    _description = 'POS Payment Category'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, name'

    name = fields.Char(string='Category Name', required=True, translate=True)
    sequence = fields.Integer(string='Sequence', default=10, help='Gives the sequence order when displaying a list of payment categories.')
    active = fields.Boolean(default=True)
    color = fields.Integer(string='Color')

    payment_method_ids = fields.One2many('pos.payment.method', 'category_id', string='Payment Methods')
    config_ids = fields.Many2many(
        'pos.config',
        'pos_config_payment_category_rel',
        'category_id', 'config_id',
        string='Point of Sale',
        help='Select which POS configurations can use this payment category. If empty, it will not appear in any POS.',
    )

    @api.model
    def _load_pos_data_domain(self, data):
        config_id = data['pos.config']['data'][0]['id']
        return [('active', '=', True), ('config_ids', 'in', [config_id])]

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields = super()._load_pos_data_fields(config_id)
        fields.extend(['name', 'sequence', 'color'])
        return fields

class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    category_id = fields.Many2one('pos.payment.category', string='Payment Category', help='Group payment methods by category (e.g. Terminal 1, QR, etc).')

    @api.model
    def _load_pos_data_fields(self, config_id):
        # Extend the standard pos.payment.method loaded fields to include category_id
        fields = super()._load_pos_data_fields(config_id)
        fields.append('category_id')
        return fields

class PosSession(models.Model):
    _inherit = 'pos.session'

    @api.model
    def _load_pos_data_models(self, config_id):
        models = super()._load_pos_data_models(config_id)
        if 'pos.payment.method' in models:
            models.insert(models.index('pos.payment.method'), 'pos.payment.category')
        else:
            models.append('pos.payment.category')
        return models

class PosPayment(models.Model):
    _inherit = 'pos.payment'

    category_id = fields.Many2one(
        comodel_name='pos.payment.category',
        related='payment_method_id.category_id',
        string='Payment Category',
        store=True,
    )

class PosConfig(models.Model):
    _inherit = 'pos.config'

    payment_category_ids = fields.Many2many(
        'pos.payment.category',
        'pos_config_payment_category_rel',
        'config_id', 'category_id',
        string='Payment Categories',
        help='Payment categories available on this POS. Only these categories will appear on the payment screen.',
    )
