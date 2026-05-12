# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def create_concept_invoice(self, order_uuid, concept, partner_id=False):
        """
        Create a single-line concept invoice from a POS order.

        The invoice line uses the full order amount_total (already tax-inclusive)
        as price_unit, with IVA 21% ventas (price_include=True) applied so Odoo
        automatically computes the correct subtotal + tax breakdown.

        :param order_uuid: str  – pos.order uuid (frontend uuid, always available)
        :param concept:    str  – invoice line description (required)
        :param partner_id: int  – res.partner id (optional, falls back to order partner)
        :return: dict with invoice_id and invoice_name
        """
        if not concept or not concept.strip():
            raise UserError(_("Please enter a concept description for the invoice."))

        # Resolve the order by uuid — the POS frontend always sends the uuid
        # which is set on the order before it reaches the server.
        order = self.search([('uuid', '=', order_uuid)], limit=1)
        if not order:
            raise UserError(_("POS Order not found (uuid: %s).") % order_uuid)

        # ── Partner ──────────────────────────────────────────────────────────
        if partner_id:
            partner = self.env['res.partner'].browse(partner_id)
        elif order.partner_id:
            partner = order.partner_id
        else:
            raise UserError(_("Please select a customer to generate the concept invoice."))

        # ── Concept product ───────────────────────────────────────────────────
        concept_product = self.env.ref(
            'pos_concept_invoice.product_concept', raise_if_not_found=False
        )
        if not concept_product:
            raise UserError(_(
                "Concept product not found. Please reinstall the pos_concept_invoice module."
            ))

        # ── IVA 21% ventas (price-included) ──────────────────────────────────
        # We look for a sale tax at 21% that is price-inclusive so that Odoo
        # correctly back-calculates subtotal and tax amount from the total.
        tax = self.env['account.tax'].search([
            ('type_tax_use', '=', 'sale'),
            ('amount', '=', 21.0),
            ('price_include', '=', True),
            ('company_id', '=', self.env.company.id),
        ], limit=1)

        # ── Income account ────────────────────────────────────────────────────
        account = (
            concept_product.property_account_income_id
            or concept_product.categ_id.property_account_income_categ_id
        )
        if not account:
            # Fallback: first active income account for the current company
            account = self.env['account.account'].search([
                ('account_type', '=', 'income'),
                ('company_ids', 'in', self.env.company.id),
                ('deprecated', '=', False),
            ], limit=1)
        if not account:
            raise UserError(_(
                "No income account found. "
                "Please configure the income account on the 'Concepto' product."
            ))

        # ── Build invoice ─────────────────────────────────────────────────────
        invoice_line_vals = {
            'name': concept.strip(),
            'product_id': concept_product.id,
            'account_id': account.id,
            'quantity': 1.0,
            'price_unit': order.amount_total,       # tax-inclusive total
            'tax_ids': [(6, 0, tax.ids)] if tax else [(5,)],
        }

        invoice_vals = {
            'move_type': 'out_invoice',
            'partner_id': partner.id,
            'invoice_date': fields.Date.today(),
            'ref': order.name,
            'invoice_line_ids': [(0, 0, invoice_line_vals)],
        }

        invoice = self.env['account.move'].sudo().create(invoice_vals)

        return {
            'invoice_id': invoice.id,
            'invoice_name': invoice.name,
        }
