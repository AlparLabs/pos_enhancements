# -*- coding: utf-8 -*-
{
    'name': 'POS Concept Invoice',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Generate a single-line concept invoice from the POS Payment Screen',
    'description': """
        Adds a "Factura Concepto" button to the POS Payment Screen.
        When clicked, the cashier enters a concept description and selects a customer.
        The backend creates an account.move with a single invoice line for the full
        order total, with IVA 21% ventas (price-included) applied so the tax breakdown
        is correctly computed.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'account', 'product'],
    'data': [
        'data/product_data.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_concept_invoice/static/src/app/**/*.scss',
            'pos_concept_invoice/static/src/app/**/*.xml',
            'pos_concept_invoice/static/src/app/**/*.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
