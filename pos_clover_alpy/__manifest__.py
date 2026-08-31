# -*- coding: utf-8 -*-
# Part of AlparLabs. See LICENSE file for full copyright and licensing details.

{
    'name': 'POS Clover / Fiserv (Alpy)',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Integrate your POS with Clover (Fiserv) Smart Terminals via Cloud Pay Display & REST API',
    'author': 'AlparData / AlparLabs',
    'website': 'https://www.alpardata.com.ar',
    'license': 'OPL-1',
    'depends': [
        'point_of_sale',
    ],
    'data': [
        'views/pos_payment_method_views.xml',
        'views/pos_payment_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_clover_alpy/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
