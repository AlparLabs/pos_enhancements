# -*- coding: utf-8 -*-
from . import models


def post_init_hook(env):
    _setup_l10n_ar_views(env)


def _setup_l10n_ar_views(env):
    l10n_ar_module = env['ir.module.module'].sudo().search([
        ('name', '=', 'l10n_ar'),
        ('state', '=', 'installed')
    ], limit=1)
    if not l10n_ar_module:
        return

    xml_id = 'pos_delivery_customer_details.l10n_ar_report_invoice_document_delivery'
    view_ref = env.ref(xml_id, raise_if_not_found=False)
    if not view_ref:
        l10n_ar_report = env.ref('l10n_ar.report_invoice_document', raise_if_not_found=False)
        if l10n_ar_report:
            env['ir.ui.view'].sudo().create({
                'name': 'pos_delivery_customer_details.l10n_ar_report_invoice_document',
                'type': 'qweb',
                'inherit_id': l10n_ar_report.id,
                'arch': """
                    <data>
                        <xpath expr="//span[@t-field='o.partner_id']" position="after">
                            <t t-if="o.has_pos_delivery_customer_details()">
                                <div t-if="o.partner_id.phone or o.partner_id.mobile" class="mt-1" style="font-size: 0.9em;">
                                    <strong>Tel: </strong><span t-out="o.partner_id.phone or o.partner_id.mobile"/>
                                </div>
                                <div t-if="o.partner_id.email" class="mt-1" style="font-size: 0.9em;">
                                    <strong>Email: </strong><span t-field="o.partner_id.email"/>
                                </div>
                            </t>
                        </xpath>
                    </data>
                """,
                'key': xml_id,
            })
