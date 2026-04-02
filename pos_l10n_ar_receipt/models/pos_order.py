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
    def get_l10n_ar_receipt_data(self, pos_reference):
        """
        Fallback: fetch AR receipt data by searching pos_reference.
        Used from the ReceiptScreen "Imprimir Factura" button on past orders
        where the account_move ID might not be in the frontend memory.

        Uses sudo() because the POS cashier user lacks ACL on account.move.
        """
        order = self.sudo().search([('pos_reference', '=', pos_reference)], limit=1)
        if not order or not order.account_move:
            return False
        return self._build_l10n_ar_receipt_data(order, order.account_move)

    @api.model
    def get_l10n_ar_receipt_data_by_move(self, account_move_id):
        """
        Primary path: fetch AR receipt data directly by account.move ID.
        The invoice ID is already available in order.raw.account_move after
        the POS sync, so no search is needed.

        Uses sudo() because the POS cashier user lacks ACL on account.move.
        """
        move = self.env['account.move'].sudo().browse(account_move_id)
        if not move or not move.exists():
            return False
        # Get the pos.order linked to this move for company details
        order = self.sudo().search([('account_move', '=', move.id)], limit=1)
        if not order:
            return False
        return self._build_l10n_ar_receipt_data(order, move)

    def _build_l10n_ar_receipt_data(self, order, move):
        """
        Build and return the dict of Argentine AFIP fields for the receipt.
        Only returns the AR-specific fields — does NOT include standard order
        fields, so Object.assign in JS won't overwrite core receipt data.
        """
        return {
            'l10n_ar_afip_auth_code': move.l10n_ar_afip_auth_code,
            'l10n_ar_afip_auth_code_due': move.l10n_ar_afip_auth_code_due,
            'l10n_ar_afip_qr_code': move.l10n_ar_afip_qr_code,
            'l10n_latam_document_number': move.l10n_latam_document_number,
            'l10n_latam_document_type_name': move.l10n_latam_document_type_id.name,
            'l10n_latam_document_type_code': move.l10n_latam_document_type_id.code,
            'l10n_ar_letter': move.l10n_ar_letter,
            'l10n_ar_company_cuit': order.company_id.vat,
            'l10n_ar_company_responsibility': order.company_id.l10n_ar_afip_responsibility_type_id.name,
            'l10n_ar_tax_details': self._get_l10n_ar_tax_details(move),
        }
