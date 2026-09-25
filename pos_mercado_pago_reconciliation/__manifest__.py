{
    'name': 'POS Mercado Pago Reconciliation',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Fetch net amount, fees and release date for Mercado Pago POS payments.',
    'description': """
Adds bank-reconciliation data to Mercado Pago payments taken in the Point of Sale.

For every payment it retrieves, from the Mercado Pago API, the net amount actually
credited, the fees charged, and the date the money is released. A scheduled job does
the fetching, so nothing is added to the POS session closing path.

Payments whose settlement is not final yet stay pending and are picked up again on a
later run, instead of being frozen with incomplete figures.

The stored schema is processor-neutral, so support for another payment processor can be
added later without touching the data or the existing records.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['pos_mercado_pago_alpy'],
    'data': [
        'data/ir_cron.xml',
        'views/pos_payment_views.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
