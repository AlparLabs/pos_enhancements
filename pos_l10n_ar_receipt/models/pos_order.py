# -*- coding: utf-8 -*-
import logging
from odoo import models, api


_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    _inherit = 'pos.order'

    def _export_for_ui(self, order):
        """
        Extend the data sent to the POS UI for the receipt.
        This includes Argentine specific fields from the linked account.move.
        NOTE: _export_for_ui is called as superuser from sync_from_ui so no
        sudo() is needed here. Date fields are auto-serialized by the ORM.
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
                'l10n_ar_company_cuit': order.company_id.vat,
                'l10n_ar_company_responsibility': order.company_id.l10n_ar_afip_responsibility_type_id.name,
                'l10n_ar_tax_details': self._get_l10n_ar_tax_details(move),
            })
        return result

    def _get_l10n_ar_tax_details(self, move):
        """
        Return a list of tax details formatted for the Argentine receipt.
        The move is expected to already be a sudo() record.
        """
        tax_details = []
        try:
            for line in move.sudo().line_ids.filtered(lambda l: l.tax_line_id):
                tax_details.append({
                    'name': line.tax_line_id.name or '',
                    'base': line.tax_base_amount,
                    'amount': line.price_subtotal,
                })
        except Exception as e:
            _logger.error("l10n_ar_receipt [Python]: error reading tax details for move %s: %s", move.id, e, exc_info=True)
        return tax_details

    @api.model
    def get_l10n_ar_receipt_data_by_move(self, account_move_id):
        """
        Primary RPC method called from the POS frontend.
        Receives the account.move ID directly (already in order.raw.account_move
        after the sync response) and returns ONLY the AR-specific receipt fields.

        Uses sudo() because the POS cashier user has no ACL on account.move.
        All values MUST be JSON-serializable: Date fields become strings,
        empty Many2one fields become False (not empty recordsets).
        """
        _logger.info("l10n_ar_receipt [Python]: get_l10n_ar_receipt_data_by_move called for move id=%s", account_move_id)

        move = self.env['account.move'].sudo().browse(account_move_id)
        if not move.exists():
            _logger.warning("l10n_ar_receipt [Python]: account.move id=%s does not exist", account_move_id)
            return False

        _logger.info(
            "l10n_ar_receipt [Python]: move found: %s | auth_code=%s | auth_code_due=%s | doc_number=%s",
            move.name,
            move.l10n_ar_afip_auth_code,
            move.l10n_ar_afip_auth_code_due,
            move.l10n_latam_document_number,
        )

        # Convert Date to string — Python date objects are NOT JSON-serializable.
        # Odoo's standard read() handles this automatically, but custom RPC methods don't.
        auth_code_due = False
        if move.l10n_ar_afip_auth_code_due:
            auth_code_due = move.l10n_ar_afip_auth_code_due.strftime('%d/%m/%Y')

        # Get company from the move itself — no need to search pos.order again.
        company = move.company_id

        data = {
            'l10n_ar_afip_auth_code': move.l10n_ar_afip_auth_code or False,
            'l10n_ar_afip_auth_code_due': auth_code_due,
            'l10n_ar_afip_qr_code': move.l10n_ar_afip_qr_code or False,
            'l10n_latam_document_number': move.l10n_latam_document_number or False,
            'l10n_latam_document_type_name': move.l10n_latam_document_type_id.name or False,
            'l10n_latam_document_type_code': move.l10n_latam_document_type_id.code or False,
            'l10n_ar_letter': move.l10n_ar_letter or False,
            'l10n_ar_company_cuit': company.vat or False,
            'l10n_ar_company_responsibility': company.l10n_ar_afip_responsibility_type_id.name or False,
            'l10n_ar_tax_details': self._get_l10n_ar_tax_details(move),
        }

        _logger.info("l10n_ar_receipt [Python]: returning data=%s", data)
        return data

    @api.model
    def get_l10n_ar_receipt_data(self, pos_reference):
        """
        Fallback RPC method: find the order by pos_reference then delegate
        to get_l10n_ar_receipt_data_by_move.
        Used when the account_move ID isn't available in the frontend.
        """
        _logger.info("l10n_ar_receipt [Python]: get_l10n_ar_receipt_data called for pos_reference=%s", pos_reference)
        order = self.sudo().search([('pos_reference', '=', pos_reference)], limit=1)
        if not order:
            _logger.warning("l10n_ar_receipt [Python]: no pos.order found for pos_reference=%s", pos_reference)
            return False
        if not order.account_move:
            _logger.warning("l10n_ar_receipt [Python]: pos.order %s has no account_move", pos_reference)
            return False
        return self.get_l10n_ar_receipt_data_by_move(order.account_move.id)
