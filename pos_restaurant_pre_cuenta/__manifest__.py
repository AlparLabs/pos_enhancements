# -*- coding: utf-8 -*-
{
    'name': 'POS Restaurant Pre-Cuenta',
    'version': '18.0.1.0.2',
    'category': 'Sales/Point of Sale',
    'summary': 'Prints a "Pre-cuenta" for restaurant tables directly from the POS actions menu.',
    'description': """
        Adds a "Pre-cuenta" button to the POS restaurant actions menu.
        Prints a clean, Argentine-style pre-bill showing:
          - Company header
          - Table number and guest count
          - Waiter name (optional — shown only if pos_restaurant_waiter is installed)
          - Order lines with quantities and prices
          - Total amount

        Can be used standalone without pos_restaurant_waiter.
        Designed for table-service restaurants in Argentina.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': [
        'pos_restaurant',
    ],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_pre_cuenta/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
