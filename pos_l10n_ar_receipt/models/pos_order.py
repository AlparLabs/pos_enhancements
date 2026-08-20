# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    # Argentine invoice data, pulled from the related account.move so it can be
    # rendered on the POS receipt. In Odoo 19 the receipt reads these fields
    # directly from the front-end order model. pos.order is loaded into the POS
    # with ALL of its fields (its _load_pos_data_fields returns [] == "everything"),
    # so these custom fields are exposed automatically. We must NOT override
    # _load_pos_data_fields here: returning a non-empty list would switch the
    # order to "only these fields" mode and drop core relations such as `lines`.
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
    l10n_ar_custom_tax_summary = fields.Json(
        string="Fiscal Transparency Summary",
        compute='_compute_l10n_ar_custom_tax_summary',
        help="VAT content and other national indirect taxes to disclose on B/C "
             "invoices under the Fiscal Transparency Regime (Law 27.743).",
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

    @api.depends('account_move', 'account_move.line_ids')
    def _compute_l10n_ar_custom_tax_summary(self):
        """Fiscal Transparency Regime (Law 27.743 / RG 5614-2024).

        Core's `_l10n_ar_get_invoice_custom_tax_summary_for_report` already
        returns an empty list for document types other than 6/7/8 (B, C, ...),
        so the receipt block simply stays hidden on A invoices. Amounts come
        back pre-formatted by the server (`formatted_tax_amount_currency`).
        """
        for order in self:
            summary = []
            # sudo(): the summary is recomputed while a cashier reads back the
            # synced order, and POS users have no read access on account.move
            # lines (core loads account.move into the POS with sudo() too).
            move = order.account_move.sudo()
            if move and hasattr(move, '_l10n_ar_get_invoice_custom_tax_summary_for_report'):
                summary = [
                    {
                        'name': detail['name'],
                        'formatted_tax_amount_currency': detail['formatted_tax_amount_currency'],
                    }
                    for detail in move._l10n_ar_get_invoice_custom_tax_summary_for_report()
                ]
            order.l10n_ar_custom_tax_summary = summary
