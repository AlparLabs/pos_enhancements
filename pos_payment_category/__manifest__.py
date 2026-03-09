{
    'name': 'POS Payment Category',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Group payment methods into categories (e.g., Terminals, QR) for a cleaner POS UI.',
    'description': """
This module allows you to bundle Point of Sale payment methods into categories.
On the payment screen, cashiers will see the top-level categories. Tapping a category
will display the payment methods inside it. Uncategorized payment methods rest on the main screen.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'views/pos_payment_category_view.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_payment_category/static/src/app/models/pos_payment_category.js',
            'pos_payment_category/static/src/app/payment_screen.js',
            'pos_payment_category/static/src/app/payment_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
