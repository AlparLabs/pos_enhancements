# -*- coding: utf-8 -*-
{
    'name': 'POS Restaurant Table Customer',
    'version': '19.0.1.0.0',
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Show customer name on occupied tables',
    'description': """
        Displays the assigned customer name on each table in the POS Restaurant floor screen.
    """,
    'depends': ['pos_restaurant'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_table_customer/static/src/app/floor_screen/floor_screen.css',
            'pos_restaurant_table_customer/static/src/app/floor_screen/floor_screen.js',
            'pos_restaurant_table_customer/static/src/app/floor_screen/floor_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
