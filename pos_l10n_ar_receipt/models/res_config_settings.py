# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    pos_l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        related='pos_config_id.l10n_ar_receipt_print_duplicate',
        readonly=False,
    )
