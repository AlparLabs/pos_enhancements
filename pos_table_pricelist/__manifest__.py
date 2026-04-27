# -*- coding: utf-8 -*-
{
    'name': 'POS Table Pricelist',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Assign a specific pricelist to individual restaurant tables in Odoo POS.',
    'description': """
POS Table Pricelist
===================

This module allows you to assign a specific pricelist to individual restaurant tables
in Odoo POS Restaurant.

When a cashier selects a table that has a pricelist assigned, the POS automatically
switches to that table's pricelist. When they select a table with no pricelist
assigned, the POS reverts to the session's default pricelist.

**Main Use Case:**
- Assign the "PedidosYa" pricelist to PedidosYa delivery tables.
- All other tables continue using the regular POS default pricelist.
- The switch is fully automatic — no cashier action required.

Key Features:
- Add a "Pricelist" field directly on the restaurant table form.
- Automatic pricelist switching on table selection.
- Reverts to POS default on tables without an assigned pricelist.
- Zero friction for cashiers — fully transparent.
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
