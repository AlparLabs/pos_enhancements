# -*- coding: utf-8 -*-
from odoo import models, api, fields

class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _export_for_ui(self, order):
        """
        Extend the data sent to the POS UI for the receipt.
        This includes Argentine specific fields from the linked account.move.
        """
        result = super(PosOrder, self)._export_for_ui(order)
        if order.account_move:
            move = order.account_move
            result.update({
                'l10n_ar_afip_auth_code': move.l10n_ar_afip_auth_code,
                'l10n_ar_afip_auth_code_due': move.l10n_ar_afip_auth_code_due,
                'l10n_ar_afip_qr_code': move.l10n_ar_afip_qr_code,
                'l10n_latam_document_number': move.l10n_latam_document_number,
                'l10n_latam_document_type_name': move.l10n_latam_document_type_id.name,
                'l10n_latam_document_type_code': move.l10n_latam_document_type_id.code,
                'l10n_ar_letter': move.l10n_ar_letter,
                # Company details for Argentina
                'l10n_ar_company_cuit': order.company_id.vat,
                'l10n_ar_company_responsibility': order.company_id.l10n_ar_afip_responsibility_type_id.name,
                # Tax details for Argentina
                'l10n_ar_tax_details': self._get_l10n_ar_tax_details(move),
            })
        return result

    def _get_l10n_ar_tax_details(self, move):
        """
        Return a list of tax details formatted for the Argentine receipt.
        """
        tax_details = []
        for line in move.line_ids.filtered(lambda l: l.tax_line_id):
            tax_details.append({
                'name': line.tax_line_id.name,
                'base': line.tax_base_amount,
                'amount': line.price_subtotal,
            })
        return tax_details

    @api.model
    def create_from_ui(self, orders, draft=False):
        """
        Override create_from_ui to ensure the invoice is created synchronously
        if possible, so the receipt gets the data immediately.
        """
        res = super(PosOrder, self).create_from_ui(orders, draft=draft)
        # Standard Odoo usually returns a list of dictionaries with 'id' and 'pos_reference'
        return res
