from odoo import Command
from odoo import SUPERUSER_ID, api

def _link_method_to_providers(payment_providers, payment_method):
    payment_providers.write({
        'payment_method_ids': [Command.set(payment_method.ids)],
    })

def migrate(cr, version):
    """
    Post-migration script to ensure that when the module is already installed previously,
    the change to newer payment method is applied despite the noupdate attribute in the provider data
    """
    env = api.Environment(cr, SUPERUSER_ID, {})
    payment_method = env.ref('payment_pay_way.payment_method_pay_way')
    if payment_method:
        # Search for all payment providers with code 'payway' across all companies
        deactivated_providers = env['payment.provider'].search([
            ('code', '=', 'payway'),
            ('state', '=', 'disabled')
        ])
        activated_providers = env['payment.provider'].search([
            ('code', '=', 'payway'),
            ('state', '!=', 'disabled')
        ])
        # Is necesary to validate if all the providers are disabled.
        # This is because if all of them are disabled then it wont be possible to link
        # the provider with the method due to L176 of payment/models/payment_method.py
        if not activated_providers and deactivated_providers:
            # Use one disabled provider and set it to 'test' in order to link the method
            # Then rollback the changes.
            provider = deactivated_providers[0]

            backup_values = {
                'payway_commerce': provider.payway_commerce,
                'payway_public_key': provider.payway_public_key,
                'payway_secret_key': provider.payway_secret_key,
                'product_surcharge_id': provider.product_surcharge_id.id,
                'journal_id': provider.journal_id.id,
            }

            product_ids = env['product.product'].search([]).ids

            journal_ids = env['account.journal'].search([
                ('type', '=', 'bank'),
                ('company_id', '=', provider.company_id.id),
            ]).ids

            provider.write({
                'state': 'test',
                'payment_method_ids': [Command.set(payment_method.ids)],
                'payway_commerce': backup_values['payway_commerce'] or '999 99999',
                'payway_public_key': backup_values['payway_public_key'] or '96e7f0d36a0648fb9a8dcb50ac06d260',
                'payway_secret_key': backup_values['payway_secret_key'] or '1b19bb47507c4a259ca22c12f78e881f',
                'product_surcharge_id': backup_values['product_surcharge_id'] or product_ids[0],
                'journal_id': backup_values['journal_id'] or journal_ids[0],
            })

            _link_method_to_providers(deactivated_providers, payment_method)

            provider.write({
                'state': 'disabled',
                'payway_commerce': backup_values['payway_commerce'],
                'payway_public_key': backup_values['payway_public_key'],
                'payway_secret_key': backup_values['payway_secret_key'],
                'product_surcharge_id': backup_values['product_surcharge_id'],
                'journal_id': backup_values['journal_id'],
            })
            deactivated_providers._deactivate_unsupported_payment_methods()
        else:
            _link_method_to_providers((activated_providers + deactivated_providers), payment_method)

            activated_providers._activate_default_pms()
