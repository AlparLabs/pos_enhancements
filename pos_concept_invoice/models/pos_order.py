from odoo import api, models, _
from odoo.exceptions import UserError


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.model
    def create_concept_invoice(self, order_uuid: str, concept: str, partner_id: int | bool = False) -> dict:
        """
        Generates a concept invoice using Odoo's native _generate_pos_order_invoice flow.
        This ensures the invoice is linked to the order, payments are reconciled,
        and the PDF can be downloaded.
        """
        if not concept or not concept.strip():
            raise UserError(_("Please enter a concept description for the invoice."))

        order = self.search([('uuid', '=', order_uuid)], limit=1)
        if not order:
            raise UserError(_("POS Order not found (uuid: %s).") % order_uuid)

        if partner_id:
            order.partner_id = partner_id
        elif not order.partner_id:
            raise UserError(_("Please select a customer to generate the concept invoice."))

        concept_product = self.env.ref('pos_concept_invoice.product_concept', raise_if_not_found=False)
        if not concept_product:
            raise UserError(_("Concept product not found. Please reinstall the pos_concept_invoice module."))

        tax = self.env['account.tax'].search([
            ('type_tax_use', '=', 'sale'),
            ('amount', '=', 21.0),
            ('price_include', '=', True),
            ('company_id', '=', self.env.company.id),
        ], limit=1)

        # Fallback to a non-included 21% tax (common in l10n_ar)
        if not tax:
            tax = self.env['account.tax'].search([
                ('type_tax_use', '=', 'sale'),
                ('amount', '=', 21.0),
                ('company_id', '=', self.env.company.id),
            ], limit=1)

        price_unit = order.amount_total
        if tax and not tax.price_include:
            price_unit = order.amount_total / (1 + tax.amount / 100.0)

        account = (
            concept_product.property_account_income_id
            or concept_product.categ_id.property_account_income_categ_id
        )
        if not account:
            account = self.env['account.account'].search([
                ('account_type', '=', 'income'),
                ('company_ids', 'in', self.env.company.id),
                ('deprecated', '=', False),
            ], limit=1)
        if not account:
            raise UserError(_("No income account found."))

        order.write({'to_invoice': True})

        ctx = {
            'concept_invoice_data': {
                'concept': concept.strip(),
                'product_id': concept_product.id,
                'account_id': account.id,
                'tax_ids': [(6, 0, tax.ids)] if tax else [(5,)],
                'price_unit': price_unit,
            }
        }
        order.with_context(**ctx)._generate_pos_order_invoice()

        return {
            'invoice_id': order.account_move.id,
            'invoice_name': order.account_move.name,
        }

    def _prepare_invoice_lines(self, move_type) -> list:
        """
        Override to inject our single concept line when generating a concept invoice,
        instead of the normal order lines.

        `move_type` is passed by _prepare_invoice_vals since 19.0; the core uses it to
        sign the quantities, so it must be forwarded to super() untouched.
        """
        ctx = self.env.context.get('concept_invoice_data')
        if ctx:
            return [(0, 0, {
                'name': ctx['concept'],
                'product_id': ctx['product_id'],
                'account_id': ctx['account_id'],
                'quantity': 1.0,
                'price_unit': ctx.get('price_unit', self.amount_total),
                'tax_ids': ctx['tax_ids'],
            })]
        return super()._prepare_invoice_lines(move_type)
