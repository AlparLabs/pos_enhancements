# -*- coding: utf-8 -*-
from typing import Any
from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    # Argentine invoice data, pulled from the related account.move so it can be
    # rendered on the POS receipt. In Odoo 19 the receipt reads these fields
    # directly from the front-end order model (loaded via _load_pos_data_fields),
    # so the old _export_for_ui override is no longer used.
    l10n_ar_afip_auth_code = fields.Char(
        string="ARCA Authorization Code (CAE)",
        related='account_move.l10n_ar_afip_auth_code',
    )
    l10n_ar_afip_auth_code_due = fields.Date(
        string="CAE Due Date",
        related='account_move.l10n_ar_afip_auth_code_due',
    )
    l10n_ar_afip_qr_code = fields.Char(
        string="ARCA QR Code",
        related='account_move.l10n_ar_afip_qr_code',
    )
    l10n_latam_document_number = fields.Char(
        string="Document Number",
        related='account_move.l10n_latam_document_number',
    )
    l10n_ar_document_type_name = fields.Char(
        string="Document Type Name",
        related='account_move.l10n_latam_document_type_id.name',
    )
    l10n_ar_document_type_code = fields.Char(
        string="Document Type Code",
        related='account_move.l10n_latam_document_type_id.code',
    )
    l10n_ar_letter = fields.Selection(
        string="Invoice Letter",
        related='account_move.l10n_latam_document_type_id.l10n_ar_letter',
    )
    l10n_ar_company_cuit = fields.Char(
        string="Company CUIT",
        related='company_id.vat',
    )
    l10n_ar_company_responsibility = fields.Char(
        string="Company ARCA Responsibility",
        related='company_id.l10n_ar_afip_responsibility_type_id.name',
    )
    l10n_ar_tax_details = fields.Json(
        string="ARCA Tax Details",
        compute='_compute_l10n_ar_tax_details',
    )

    @api.depends('account_move', 'account_move.line_ids')
    def _compute_l10n_ar_tax_details(self):
        for order in self:
            details = []
            move = order.account_move
            if move:
                for line in move.line_ids.filtered(lambda l: l.tax_line_id):
                    details.append({
                        'name': line.tax_line_id.name,
                        'base': line.tax_base_amount,
                        'amount': line.price_subtotal,
                    })
            order.l10n_ar_tax_details = details

    @api.model
    def _load_pos_data_fields(self, config_id: Any) -> list[str]:
        fields = super()._load_pos_data_fields(config_id)
        fields += [
            'l10n_ar_afip_auth_code',
            'l10n_ar_afip_auth_code_due',
            'l10n_ar_afip_qr_code',
            'l10n_latam_document_number',
            'l10n_ar_document_type_name',
            'l10n_ar_document_type_code',
            'l10n_ar_letter',
            'l10n_ar_company_cuit',
            'l10n_ar_company_responsibility',
            'l10n_ar_tax_details',
        ]
        return fields
