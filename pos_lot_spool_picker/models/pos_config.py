from odoo import fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    # When True the spool picker blocks confirming an allocation that exceeds a lot's
    # real remaining stock. Default False = warn but allow (cable meters never match exactly).
    spool_picker_enforce_stock = fields.Boolean(
        string='Enforce Spool Stock',
        help='If enabled, the spool picker prevents assigning more meters than a lot has '
             'in stock. If disabled, it only shows a warning and still allows confirming.',
        default=False,
    )
