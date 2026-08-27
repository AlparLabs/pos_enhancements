{
    'name': 'POS Concept Invoice',
    'version': '19.0.3.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Pre-payment invoice choice (Standard / Concept / Receipt), on-screen fiscal receipt, and direct POS printer output',
    'description': """
        Adds flexible invoice selection directly to the POS Payment Screen (Standard Invoice, Concept Invoice,
        or Simple Ticket) as well as post-payment buttons on Receipt Screen and Ticket Screen.
        When Concept Invoice is chosen, a single invoice line is generated with IVA 21% ventas (price-included)
        for the full order total, authorized with ARCA/AFIP, rendered reactively on the POS receipt, and printed
        directly to the thermal printer in a single print job.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'account', 'product', 'pos_l10n_ar_receipt'],
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
