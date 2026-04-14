# -*- coding: utf-8 -*-
{
    'name': 'POS Table Timer',
    "summary": "Track restaurant table duration automatically in Odoo POS and calculate total stay time.",
    'description': """
        This module allows restaurants to automatically track how long a table is occupied directly from the Odoo 
        POS Restaurant floor screen.
        
        This module starts counting time when an order is created and calculates the total table duration when the 
        order is validated. The total stay time is stored in the POS order and can be used for billing, reporting, 
        or operational analysis.

        Key Features:
        - Automatically start table timer when order is submitted.
        - Live table duration display on the POS Restaurant floor screen.
        - Automatically compute total duration on payment validation.
        - Store total duration in POS Order.
        - Simple configuration from POS settings.
        - Lightweight and optimized architecture.
        - Compatible with Odoo POS Restaurant.
        
    """,
    "author": "CodeSphere Tech",
    "website": "https://www.codespheretech.in/",
    "category": "Point of Sale",
    "version": "18.0.1.0.0",
    "sequence": 0,
    "currency": "USD",
    "price": "0",
    "depends": ['base', 'pos_restaurant', ],
    "data": [
        'views/pos_order_view.xml',
        'views/res_config_settings_views.xml',
    ],
    "assets": {
        'point_of_sale._assets_pos': [
            'cst_pos_table_time_counter/static/src/**/*',
        ],
    },
    "images": ["static/description/Banner.png"],
    "license": "LGPL-3",
    "installable": True,
    "application": False,
    "auto_install": False,
}