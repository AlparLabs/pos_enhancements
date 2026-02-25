{
    'name': 'POS Discount Supervisor Clearance',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Requires supervisor clearance (PIN/Barcode) for POS discounts.',
    'description': """
This module overrides the default discount buttons in the Point of Sale. 
If a cashier (non-manager) attempts to apply a line discount or a global discount, they will be prompted to ask a manager/supervisor to enter their PIN or scan their barcode.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_discount', 'pos_hr'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_discount_supervisor/static/src/overrides/components/discount_button.js',
            'pos_discount_supervisor/static/src/overrides/components/numpad.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
