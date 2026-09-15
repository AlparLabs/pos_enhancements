# -*- coding: utf-8 -*-
{
    'name': 'POS Refund to Scrap / Merma Management',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Directs POS refunds of food / perishable products to Scrap / Waste location instead of available stock.',
    'description': """
POS Refund to Scrap / Merma Management
======================================
In hospitality (restaurants, bars, cafes) and perishable retail, food prepared or returned by customers cannot be returned to available inventory.
This module allows:
- Configuring whether POS refunds should be diverted to a Scrap / Waste location (Virtual Locations/Scrap) rather than WH/Stock.
- Defining the policy globally for the POS config or selectively by POS Category (e.g. kitchen dishes go to Scrap, unopened drinks return to Stock).
- Automatic visual indicator and toggle in the POS interface on refund order lines.
- Accurate inventory valuation without ghost stock or invalid COGS reversal.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'stock'],
    'data': [
        'views/res_config_settings_views.xml',
        'views/pos_category_views.xml',
        'views/pos_order_views.xml',
        'views/stock_scrap_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_refund_scrap/static/src/app/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
