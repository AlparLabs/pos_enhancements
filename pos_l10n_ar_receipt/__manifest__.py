# -*- coding: utf-8 -*-
{
    'name': 'POS Argentina Receipt Enhancement',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Add Argentina ARCA (AFIP) details to POS receipt',
    'description': """
This module adds legal Argentine electronic invoice details to the POS receipt,
including CAE, CAE Expiration, Invoice Number, and AFIP QR Code.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'depends': ['point_of_sale', 'l10n_ar', 'l10n_ar_edi'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_l10n_ar_receipt/static/src/app/**/*.xml',
            'pos_l10n_ar_receipt/static/src/app/**/*.scss',
        ],
    },
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
