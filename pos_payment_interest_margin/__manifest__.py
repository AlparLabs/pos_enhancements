{
    'name': 'POS Payment Interest Margin',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Add an interest margin % surcharge to specific payment methods.',
    'description': """
This module allows you to configure an interest margin percentage on POS Payment Methods.
When a cashier selects this payment method, the POS automatically calculates the surcharge
and adds it as an order line using a configured Interest Product.
    """,
    'author': 'AlparData',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'views/pos_payment_method_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_payment_interest_margin/static/src/app/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
