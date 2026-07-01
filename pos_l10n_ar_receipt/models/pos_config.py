# -*- coding: utf-8 -*-
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    l10n_ar_receipt_print_duplicate = fields.Boolean(
        string='Print Original and Duplicate (AR)',
        default=False,
        help=(
            "When enabled, invoiced sales print two receipt copies: one labelled "
            "ORIGINAL and one labelled DUPLICADO, for internal control."
        ),
    )
    l10n_ar_show_product_reference = fields.Boolean(
        string='Show Internal Reference on Receipt',
        default=False,
        help=(
            "When enabled, the product's internal reference (default code) is "
            "printed in bold before its name on the invoiced receipt."
        ),
    )

    @api.model
    def _load_pos_data_read(self, records, config):
        # pos.config fields are NOT loaded via _load_pos_data_fields (the base mixin
        # returns [] and core adds fields directly in its _load_pos_data_read override).
        # We follow the same pattern used in pos_centralized_payment to avoid
        # restricting the DB read and breaking core fields.
        read_records = super()._load_pos_data_read(records, config)
        if read_records:
            read_records[0]['l10n_ar_receipt_print_duplicate'] = config.l10n_ar_receipt_print_duplicate
            read_records[0]['l10n_ar_show_product_reference'] = config.l10n_ar_show_product_reference
        return read_records
