from odoo import api, fields, models, _
from odoo.exceptions import UserError


class PosOrder(models.Model):
    _inherit = 'pos.order'

    concept_invoice_name = fields.Char(
        string="Concept Invoice Name",
        help="Description used when a single-line concept invoice was generated for this order.",
    )

    # ------------------------------------------------------------------
    # Concept line resolution
    #
    # Everything below resolves against `order.company_id.parent_ids`, never
    # against `self.env.company`: `_generate_pos_order_invoice` runs the whole
    # flow under `with_company(order.company_id)`, so inside a branch POS
    # `env.company` is the branch, which owns no taxes and no chart of its own.
    # A search with `company_id = env.company.id` returns nothing there, and the
    # line used to be built with no tax at all -- which only surfaces later as
    # ARCA's "there should be a single tax from the VAT tax group per line".
    # ------------------------------------------------------------------

    def _concept_invoice_product(self):
        product = self.env.ref('pos_concept_invoice.product_concept', raise_if_not_found=False)
        if not product:
            raise UserError(_("Concept product not found. Please reinstall the pos_concept_invoice module."))
        return product

    def _concept_invoice_company(self):
        self.ensure_one()
        return self.company_id or self.env.company

    def _is_vat_tax(self, tax):
        """True when the tax belongs to a tax group ARCA recognises as VAT."""
        group = tax.tax_group_id
        if 'l10n_ar_vat_afip_code' in group._fields:
            return bool(group.l10n_ar_vat_afip_code)
        return True

    def _resolve_concept_tax(self):
        """Return the single VAT tax to apply on the concept line.

        Raises a descriptive UserError instead of silently producing a line
        without taxes, which is what ARCA rejects further down the flow.
        """
        self.ensure_one()
        company = self._concept_invoice_company()
        product = self._concept_invoice_product()

        # Branches own no taxes: the chart lives on the root company and the
        # branch inherits it. `_check_company_domain` is what Odoo itself uses
        # to express that (`parent_of`, not `=`), so it keeps working whatever
        # the company tree looks like.
        taxes = product.taxes_id.filtered(lambda t: t.company_id in company.parent_ids)
        if not taxes:
            taxes = self.env['account.tax'].search(
                self.env['account.tax']._check_company_domain(company) + [
                    ('type_tax_use', '=', 'sale'),
                    ('amount', '=', 21.0),
                ]
            )

        vat_taxes = taxes.filtered(self._is_vat_tax)
        # A branch may redefine the parent's tax; the most specific one wins.
        own_taxes = vat_taxes.filtered(lambda t: t.company_id == company)
        if own_taxes:
            vat_taxes = own_taxes

        if len(vat_taxes) != 1:
            raise UserError(_(
                'The "%(product)s" product resolves to %(count)s VAT tax(es) for %(company)s '
                '(%(taxes)s), but exactly one is required.\n\n'
                'Set a single sale VAT tax on that product for %(company)s or for its parent company.',
                product=product.display_name,
                count=len(vat_taxes),
                company=company.display_name,
                taxes=', '.join(vat_taxes.mapped('name')) or _('none'),
            ))
        return vat_taxes

    def _resolve_concept_account(self):
        """Return the income account for the concept line."""
        self.ensure_one()
        company = self._concept_invoice_company()
        product = self._concept_invoice_product().with_company(company)

        account = (
            product.property_account_income_id
            or product.categ_id.property_account_income_categ_id
        )
        if not account:
            # Same inheritance rule as the taxes: the branch reads the root
            # company's chart of accounts.
            account = self.env['account.account'].search(
                self.env['account.account']._check_company_domain(company) + [
                    ('account_type', '=', 'income'),
                    ('deprecated', '=', False),
                ], limit=1
            )
        if not account:
            raise UserError(_(
                'No income account found for %(company)s. Set one on the "%(product)s" product '
                'or on its product category.',
                company=company.display_name,
                product=product.display_name,
            ))
        return account

    def _concept_invoice_price_unit(self, tax):
        """Untax the order total when the resolved tax is not price-included."""
        self.ensure_one()
        if tax and not tax.price_include:
            return self.amount_total / (1 + tax.amount / 100.0)
        return self.amount_total

    @api.model
    def check_concept_invoice_config(self, order_uuid=False) -> dict:
        """Read-only pre-flight check for the POS frontend.

        Resolves exactly what the invoice line would carry, without creating or
        posting anything, so the cashier is warned before entering the concept
        rather than after, when the only remaining error comes from ARCA.
        """
        order = self.search([('uuid', '=', order_uuid)], limit=1) if order_uuid else self.browse()
        if not order:
            return {'ok': False, 'message': _("POS Order not found (uuid: %s).") % order_uuid}
        try:
            order._resolve_concept_tax()
            order._resolve_concept_account()
        except UserError as error:
            return {'ok': False, 'message': str(error)}
        return {'ok': True, 'message': ''}

    @api.model
    def create_concept_invoice(self, order_uuid: str, concept: str, partner_id: int | bool = False) -> dict:
        """
        Generates a concept invoice using Odoo's native _generate_pos_order_invoice flow.
        This ensures the invoice is linked to the order, payments are reconciled,
        and the AFIP fiscal receipt is generated and returned to the POS frontend.
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

        # Fail here, before any write, with a message the cashier can act on.
        order._resolve_concept_tax()
        order._resolve_concept_account()

        order.write({
            'to_invoice': True,
            'concept_invoice_name': concept.strip(),
        })

        # The line itself is built in _prepare_invoice_lines, which resolves the
        # tax and the account again from the order's own company. Only the text
        # travels in the context, so nothing can diverge between both sides.
        order.with_context(concept_invoice_data={'concept': concept.strip()})._generate_pos_order_invoice()

        move = order.account_move
        auth_code_due = False
        if getattr(move, 'l10n_ar_afip_auth_code_due', False):
            auth_code_due = move.l10n_ar_afip_auth_code_due.strftime('%d/%m/%Y')

        partner_data = False
        if order.partner_id:
            partner_data = {
                'id': order.partner_id.id,
                'name': order.partner_id.name,
                'vat': order.partner_id.vat or False,
            }

        return {
            'invoice_id': move.id,
            'invoice_name': move.name,
            'concept': concept.strip(),
            'partner_id': order.partner_id.id if order.partner_id else False,
            'partner': partner_data,
            'l10n_ar_afip_auth_code': getattr(move, 'l10n_ar_afip_auth_code', False) or False,
            'l10n_ar_afip_auth_code_due': auth_code_due,
            'l10n_ar_afip_qr_code': getattr(move, 'l10n_ar_afip_qr_code', False) or False,
            'l10n_latam_document_number': getattr(move, 'l10n_latam_document_number', False) or False,
            'l10n_ar_document_type_name': move.l10n_latam_document_type_id.name if move.l10n_latam_document_type_id else False,
            'l10n_ar_document_type_code': move.l10n_latam_document_type_id.code if move.l10n_latam_document_type_id else False,
            'l10n_ar_letter': getattr(move, 'l10n_ar_letter', False) or (move.l10n_latam_document_type_id.l10n_ar_letter if move.l10n_latam_document_type_id else False),
            'l10n_ar_company_cuit': order.company_id.vat or False,
            'l10n_ar_company_responsibility': order.company_id.l10n_ar_afip_responsibility_type_id.name if order.company_id.l10n_ar_afip_responsibility_type_id else False,
            'l10n_ar_tax_details': getattr(order, 'l10n_ar_tax_details', []) or [],
            'l10n_ar_custom_tax_summary': getattr(order, 'l10n_ar_custom_tax_summary', []) or [],
        }

    def _prepare_invoice_lines(self, move_type) -> list:
        """
        Override to inject our single concept line when generating a concept invoice,
        instead of the normal order lines.

        `move_type` is passed by _prepare_invoice_vals since 19.0; the core uses it to
        sign the quantities, so it must be forwarded to super() untouched.
        """
        ctx = self.env.context.get('concept_invoice_data')
        concept = ctx['concept'] if ctx else self.concept_invoice_name
        if not concept:
            return super()._prepare_invoice_lines(move_type)

        product = self._concept_invoice_product()
        tax = self._resolve_concept_tax()
        account = self._resolve_concept_account()

        return [(0, 0, {
            'name': concept.strip(),
            'product_id': product.id,
            'account_id': account.id,
            'quantity': 1.0,
            'price_unit': self._concept_invoice_price_unit(tax),
            'tax_ids': [(6, 0, tax.ids)],
        })]
