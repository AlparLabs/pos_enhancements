# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.fields import Domain


class LoyaltyRule(models.Model):
    _inherit = 'loyalty.rule'

    excluded_product_category_ids = fields.Many2many(
        'product.category',
        'loyalty_rule_excluded_category_rel',
        'rule_id',
        'category_id',
        string="Categorías Excluidas",
        help="Los productos de estas categorías (y sus subcategorías) no calificarán para esta regla ni sumarán para el monto/cantidad mínima."
    )
    excluded_product_ids = fields.Many2many(
        'product.product',
        'loyalty_rule_excluded_product_rel',
        'rule_id',
        'product_id',
        string="Productos Excluidos",
        help="Productos específicos que quedan excluidos del cómputo de esta regla."
    )

    def _get_valid_product_domain(self):
        domain = super()._get_valid_product_domain()
        if self.excluded_product_category_ids:
            domain = Domain.AND([domain, [('categ_id', 'not child_of', self.excluded_product_category_ids.ids)]])
        if self.excluded_product_ids:
            domain = Domain.AND([domain, [('id', 'not in', self.excluded_product_ids.ids)]])
        return domain

    @api.depends('product_ids', 'product_category_id', 'product_tag_id', 'product_domain',
                 'excluded_product_category_ids', 'excluded_product_ids')
    def _compute_valid_product_ids(self):
        super()._compute_valid_product_ids()
        for rule in self:
            if rule.excluded_product_category_ids or rule.excluded_product_ids:
                domain = Domain.AND([[('available_in_pos', '=', True)], rule._get_valid_product_domain()])
                rule.valid_product_ids = self.env['product.product'].search(domain, order="id")
                rule.any_product = False
