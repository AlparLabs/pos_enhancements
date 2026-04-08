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
                'l10n_ar_custom_tax_summary': move._l10n_ar_get_invoice_custom_tax_summary_for_report() if hasattr(move, '_l10n_ar_get_invoice_custom_tax_summary_for_report') else [],
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
        try:
            _logger.info("l10n_ar_receipt [Python]: get_l10n_ar_receipt_data_by_move called for move id=%s", account_move_id)

            if isinstance(account_move_id, (list, tuple)):
                account_move_id = account_move_id[0]
            
            move = self.env['account.move'].sudo().browse(account_move_id)
            if not move.exists():
                _logger.warning("l10n_ar_receipt [Python]: account.move id=%s does not exist", account_move_id)
                return False

            auth_code_due = False
            if move.l10n_ar_afip_auth_code_due:
                auth_code_due = move.l10n_ar_afip_auth_code_due.strftime('%d/%m/%Y')

            company = move.company_id

            data = {
                'l10n_ar_afip_auth_code': move.l10n_ar_afip_auth_code or False,
                'l10n_ar_afip_auth_code_due': auth_code_due,
                'l10n_ar_afip_qr_code': getattr(move, 'l10n_ar_afip_qr_code', False) or False,
                'l10n_latam_document_number': getattr(move, 'l10n_latam_document_number', False) or False,
                'l10n_latam_document_type_name': move.l10n_latam_document_type_id.name if move.l10n_latam_document_type_id else False,
                'l10n_latam_document_type_code': move.l10n_latam_document_type_id.code if move.l10n_latam_document_type_id else False,
                'l10n_ar_letter': getattr(move, 'l10n_ar_letter', False) or False,
                'l10n_ar_company_cuit': company.vat or False,
                'l10n_ar_company_responsibility': company.l10n_ar_afip_responsibility_type_id.name if company.l10n_ar_afip_responsibility_type_id else False,
                'l10n_ar_tax_details': self._get_l10n_ar_tax_details(move),
                'l10n_ar_custom_tax_summary': move._l10n_ar_get_invoice_custom_tax_summary_for_report() if hasattr(move, '_l10n_ar_get_invoice_custom_tax_summary_for_report') else [],
            }

            _logger.info("l10n_ar_receipt [Python]: returning data=%s", data)
            return data
        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            _logger.error("l10n_ar_receipt [Python]: Exception in get_l10n_ar_receipt_data_by_move: %s", error_details)
            return {'error_message': str(e), 'error_traceback': error_details}

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
