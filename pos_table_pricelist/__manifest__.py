# -*- coding: utf-8 -*-
{
    'name': 'POS Table Pricelist',
    'version': '19.0.1.0.1',
    'category': 'Sales/Point of Sale',
    'summary': 'Assign a specific pricelist to individual restaurant tables in Odoo POS.',
    'description': """
POS Table Pricelist
===================

Allows assigning a specific pricelist to individual restaurant tables in POS Restaurant.
When a cashier selects a table that has a pricelist assigned, the POS automatically
switches to that table's pricelist. Tables without an assigned pricelist revert to the
session's default pricelist.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_restaurant', 'product'],
    'data': [
        'views/restaurant_table_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_table_pricelist/static/src/js/models/restaurant_table_patch.js',
            'pos_table_pricelist/static/src/js/floor_screen_patch.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
