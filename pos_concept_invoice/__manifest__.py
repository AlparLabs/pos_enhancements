{
    'name': 'POS Concept Invoice',
    'version': '19.0.2.1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Generate a single-line concept invoice, display on receipt screen, and print directly to POS printer',
    'description': """
        Adds a "Factura Concepto" button to the POS Receipt Screen and Ticket Screen for finalized orders
        that don't have an invoice yet. When clicked, the cashier enters a concept
        description and selects a customer. The backend creates an account.move with a
        single invoice line for the full order total, with IVA 21% ventas (price-included)
        applied so the tax breakdown is correctly computed. The POS receipt preview reactively
        updates to display the Argentine fiscal receipt with the concept line, and prints directly
        to the POS thermal printer.
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
