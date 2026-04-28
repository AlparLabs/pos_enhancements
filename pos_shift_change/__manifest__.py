{
    'name': 'POS Shift Change',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Close POS session without cancelling open (draft) table orders – ideal for shift changes in restaurants.',
    'description': """
This module adds a "Shift Change" button to the POS closing popup.
When triggered, all open (draft) orders are transferred to a new continuation
session for the same POS terminal, while only the paid/invoiced orders are
accounted for in the closing entry. The next shift opens the POS and finds
the open tables exactly as they were left.

Typical use case: restaurants that operate across multiple shifts without
closing the kitchen or losing mid-service orders.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['pos_restaurant'],
    'data': [
        'views/pos_config_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_shift_change/static/src/overrides/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
