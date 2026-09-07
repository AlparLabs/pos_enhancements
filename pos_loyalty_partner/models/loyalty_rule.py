# -*- coding: utf-8 -*-
from odoo import api, fields, models


class LoyaltyRule(models.Model):
    _inherit = 'loyalty.rule'

    partner_category_ids = fields.Many2many(
        'res.partner.category',
        'loyalty_rule_partner_category_rel',
        'rule_id',
        'category_id',
        string="Etiquetas de Contacto",
        help="Si se especifica, el cliente debe tener al menos una de estas etiquetas para que la regla sea aplicable."
    )
    partner_ids = fields.Many2many(
        'res.partner',
        'loyalty_rule_res_partner_rel',
        'rule_id',
        'partner_id',
        string="Contactos Específicos",
        help="Si se especifica, solo los clientes seleccionados podrán acceder a la regla."
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields = super()._load_pos_data_fields(config)
        return list(set(fields + ['partner_category_ids', 'partner_ids']))

    def _is_partner_eligible(self, partner):
        """Verifica si un contacto cumple con las restricciones de la regla."""
        self.ensure_one()
        if not self.partner_category_ids and not self.partner_ids:
            return True
        if not partner:
            return False
        if self.partner_ids and partner in self.partner_ids:
            return True
        if self.partner_category_ids and bool(partner.category_id & self.partner_category_ids):
            return True
        return False
