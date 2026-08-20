# -*- coding: utf-8 -*-
{
    'name': 'POS Restaurant Auto Guest Count',
    'version': '19.0.2.0.0',
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Automatically prompt for guest count when selecting a table.',
    'depends': ['pos_restaurant'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_auto_guest_count/static/src/app/overrides/models/pos_store.js',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
