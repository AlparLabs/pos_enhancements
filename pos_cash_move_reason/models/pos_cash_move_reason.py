from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class PosCashMoveReason(models.Model):
    _name = 'pos.cash.move.reason'
    _description = 'POS Cash Move Reason'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, name'

    name = fields.Char(
        string='Concept',
        required=True,
        help='Label shown on the button in the cash in/out popup, e.g. "PROVEEDORES".',
    )
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(string='Active', default=True)
    move_type = fields.Selection(
        [('in', 'Cash In'), ('out', 'Cash Out'), ('both', 'Both')],
        string='Applies To',
        required=True,
        default='out',
    )
    account_id = fields.Many2one(
        'account.account',
        string='Counterpart Account',
        check_company=True,
        ondelete='restrict',
        domain="[('deprecated', '=', False)]",
        help='Account the cash move is posted against. Leave empty to fall back to the '
             "cash journal's suspense account, which is the standard Odoo behaviour.",
    )
    partner_mode = fields.Selection(
        [('none', 'No contact'), ('fixed', 'Fixed contact'), ('ask', 'Ask the cashier')],
        string='Contact Mode',
        required=True,
        default='none',
    )
    partner_id = fields.Many2one(
        'res.partner',
        string='Fixed Contact',
        ondelete='restrict',
        help='Used only when Contact Mode is "Fixed contact".',
    )
    config_ids = fields.Many2many(
        'pos.config',
        string='Points of Sale',
        help='Terminals that show this concept. Leave empty to show it on every terminal.',
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company,
    )

    @api.constrains('partner_mode', 'partner_id')
    def _check_partner_id_required(self):
        for reason in self:
            if reason.partner_mode == 'fixed' and not reason.partner_id:
                raise ValidationError(_(
                    'The concept "%s" is set to use a fixed contact, so a contact must be selected.',
                    reason.name,
                ))

    @api.model
    def _load_pos_data_domain(self, data, config):
        # Same shape as core's pos.bill: an empty config_ids means "every terminal".
        return [
            ('company_id', '=', config.company_id.id),
            '|', ('config_ids', '=', config.id), ('config_ids', '=', False),
        ]

    @api.model
    def _load_pos_data_fields(self, config):
        # account_id is deliberately NOT sent to the browser: the client has no business
        # knowing the chart of accounts, and the server re-reads it anyway.
        # partner_id is left out too — POS only loads a subset of res.partner, so a fixed
        # contact outside that subset would arrive as a dangling relation. The server
        # resolves the fixed contact itself.
        return ['id', 'name', 'sequence', 'move_type', 'partner_mode']
