# -*- coding: utf-8 -*-
{
    'name': 'POS Restaurant Waiter Assignment',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Assign a waiter to each restaurant table from POS.',
    'description': """
        When a table is selected in the POS Restaurant floor screen, the cashier
        is prompted to choose the employee (waiter) serving that table.
        The selected waiter is stored on the pos.order and visible in the backend
        for reporting and traceability.

        Requires:
          - pos_restaurant
          - pos_hr (for employee list)
          - pos_restaurant_auto_guest_count (waiter popup follows the guest count popup)
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': [
        'pos_restaurant',
        'pos_hr',
        'pos_restaurant_auto_guest_count',
    ],
    'data': [
        'views/pos_order_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_waiter/static/src/app/waiter_popup/waiter_popup.css',
            'pos_restaurant_waiter/static/src/app/waiter_popup/waiter_popup.js',
            'pos_restaurant_waiter/static/src/app/waiter_popup/waiter_popup.xml',
            'pos_restaurant_waiter/static/src/app/overrides/control_buttons/control_buttons.js',
            'pos_restaurant_waiter/static/src/app/overrides/control_buttons/control_buttons.xml',
            'pos_restaurant_waiter/static/src/app/overrides/models/pos_store.js',
            'pos_restaurant_waiter/static/src/app/overrides/floor_screen/floor_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
