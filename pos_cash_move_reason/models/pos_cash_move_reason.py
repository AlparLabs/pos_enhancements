import re
import unicodedata

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError

VALID_CODE = re.compile(r'[A-Z0-9][A-Z0-9_.\-]*')


class PosCashMoveReason(models.Model):
    _name = 'pos.cash.move.reason'
    _description = 'POS Cash Move Reason'
    _inherit = ['pos.load.mixin']
    _order = 'sequence, name'

    _code_company_uniq = models.Constraint(
        'unique (company_id, code)',
        'A cash move concept code must be unique per company.',
    )

    name = fields.Char(
        string='Concept',
        required=True,
        help='Label shown on the button in the cash in/out popup, e.g. "Proveedores".',
    )
    code = fields.Char(
        string='Code',
        required=True,
        help='Short, stable identifier written into the movement label between square '
             'brackets, e.g. "[PROVEEDORES] factura 0001-00034". Reconciliation models in '
             'Accounting match on it, so renaming the concept never breaks them — changing '
             'the code does.',
    )
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(string='Active', default=True)
    move_type = fields.Selection(
        [('in', 'Cash In'), ('out', 'Cash Out'), ('both', 'Both')],
        string='Applies To',
        required=True,
        default='out',
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

    @api.model
    def _normalize_code(self, code):
        """Uppercase, strip accents and turn whitespace into underscores.

        The code travels inside a free-text field a cashier can edit, so the fewer
        characters that need typing care, the better.
        """
        code = unicodedata.normalize('NFKD', (code or '').strip())
        code = code.encode('ascii', 'ignore').decode()
        return re.sub(r'\s+', '_', code).upper()

    @api.constrains('code')
    def _check_code(self):
        for reason in self:
            if not VALID_CODE.fullmatch(reason.code or ''):
                raise ValidationError(_(
                    'The code "%(code)s" of concept "%(name)s" is not valid. Use letters, '
                    'digits, "_", "." and "-" only, starting with a letter or a digit. '
                    'Square brackets are reserved: they delimit the code inside the '
                    'movement label.',
                    code=reason.code or '',
                    name=reason.name,
                ))

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('code'):
                vals['code'] = self._normalize_code(vals['code'])
        return super().create(vals_list)

    def write(self, vals):
        if vals.get('code'):
            vals['code'] = self._normalize_code(vals['code'])
        return super().write(vals)

    @api.model
    def _load_pos_data_domain(self, data, config):
        # Same shape as core's pos.bill: an empty config_ids means "every terminal".
        return [
            ('company_id', '=', config.company_id.id),
            '|', ('config_ids', '=', config.id), ('config_ids', '=', False),
        ]

    @api.model
    def _load_pos_data_fields(self, config):
        return ['id', 'name', 'code', 'sequence', 'move_type']
