# -*- coding: utf-8 -*-
{
    'name': 'POS NPS Survey QR on Receipt',
    'version': '19.0.1.1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Add customizable NPS survey QR code to POS receipts',
    'description': """
This module allows configuring a survey URL (NPS / Customer Feedback) per Point of Sale,
and renders a clean QR code with customizable title and subtitle on customer receipts.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'depends': ['point_of_sale'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_nps_survey_qr/static/src/app/**/*.js',
            'pos_nps_survey_qr/static/src/app/**/*.xml',
        ],
    },
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
