# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.fields import Domain


class LoyaltyReward(models.Model):
    _inherit = 'loyalty.reward'

    excluded_product_category_ids = fields.Many2many(
        'product.category',
        'loyalty_reward_excluded_category_rel',
        'reward_id',
        'category_id',
        string="Categorías Excluidas",
        help="Los productos de estas categorías (y sus subcategorías) no recibirán el descuento de esta recompensa."
    )
    excluded_product_ids = fields.Many2many(
        'product.product',
        'loyalty_reward_excluded_product_rel',
        'reward_id',
        'product_id',
        string="Productos Excluidos",
        help="Productos específicos que quedan excluidos de recibir el descuento de esta recompensa."
    )
    exclude_already_discounted = fields.Boolean(
        string="Excluir productos con descuento o promoción previa",
        default=True,
        help="Si está marcado, las líneas de productos que ya tengan un porcentaje de descuento previo o provengan de otra promoción serán omitidas de este descuento."
    )
    all_excluded_product_ids = fields.Many2many(
        'product.product',
        string="Todos los Productos Excluidos (POS)",
        compute='_compute_all_excluded_product_ids',
        help="Campo técnico computado para optimizar la verificación instantánea en el Punto de Venta."
    )

    @api.depends('excluded_product_category_ids', 'excluded_product_ids')
    def _compute_all_excluded_product_ids(self):
        for reward in self:
            domain_parts = []
            if reward.excluded_product_category_ids:
                domain_parts.append([('categ_id', 'child_of', reward.excluded_product_category_ids.ids)])
            if reward.excluded_product_ids:
                domain_parts.append([('id', 'in', reward.excluded_product_ids.ids)])
            if domain_parts:
                domain = Domain.OR(domain_parts)
                reward.all_excluded_product_ids = self.env['product.product'].search(domain)
            else:
                reward.all_excluded_product_ids = self.env['product.product'].browse()

    @api.model
    def _load_pos_data_fields(self, config):
        fields = super()._load_pos_data_fields(config)
        return list(set(fields + ['all_excluded_product_ids', 'exclude_already_discounted']))
