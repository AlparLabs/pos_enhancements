{
    'name': 'POS Retail Pre-Ticket',
    'version': '18.0.1.0.1',
    'category': 'Sales/Point of Sale',
    'summary': 'Adds a Pre-Ticket printing button to the standard retail POS',
    'description': """
This module adds a "Print Pre-Ticket" button to the standard Point of Sale interface.
It allows cashiers or salespersons to print a draft receipt with a barcode for the customer to take to the central checkout,
eliminating the need to use the pos_restaurant module solely for the pre-ticket feature.
    """,
    'author': 'AlparData',
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_retail_pre_ticket/static/src/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
