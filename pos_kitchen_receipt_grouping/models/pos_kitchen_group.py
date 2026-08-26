from typing import Any

from odoo import api, fields, models


class PosKitchenGroup(models.Model):
    _name = 'pos.kitchen.group'
    _description = 'POS Kitchen Group'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, id'

    name = fields.Char(string='Name', required=True)
    sequence = fields.Integer(
        string='Sequence',
        default=10,
        help="Orders the blocks on the kitchen receipt. Lower numbers print first.",
    )
    active = fields.Boolean(
        string='Active',
        default=True,
        help="Archived groups are hidden from the configuration. Categories already "
             "pointing at an archived group keep printing under it.",
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        index=True,
        default=lambda self: self.env.company,
        help="Leave empty to make the group available to every company. Note that "
             "POS categories are global, so a category points at the same group for "
             "all companies; only the per-product override is company specific.",
    )
    category_ids = fields.One2many(
        'pos.category',
        'kitchen_group_id',
        string='POS Categories',
    )

    _name_uniq = models.Constraint(
        'unique (name, company_id)',
        'A kitchen group with this name already exists for this company.',
    )

    @api.model
    def _load_pos_data_domain(self, data: Any, config: Any) -> list:
        # Few records, and the receipt may need any of them (a product can
        # override its category's group), so they are not filtered by the
        # categories enabled on the POS — only by company.
        return ['|', ('company_id', '=', False), ('company_id', '=', config.company_id.id)]

    @api.model
    def _load_pos_data_fields(self, config: Any) -> list[str]:
        return ['id', 'name', 'sequence']
