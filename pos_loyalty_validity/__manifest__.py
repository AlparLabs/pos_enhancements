{
    'name': 'POS Loyalty Program Schedule & Validity',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Configure day-of-week and time-slot (Happy Hour) validity for loyalty programs in POS.',
    'description': """
POS Loyalty Program Schedule & Validity
=======================================
Adds advanced temporal validity to Point of Sale loyalty and discount programs:
- Day of the week restrictions (e.g. Tuesday Senior discount, Member Thursdays).
- Time slot restrictions / Happy Hours (e.g. 18:00 to 20:00).
- Real-time instant evaluation in POS using the cashier terminal's local time.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_loyalty', 'loyalty'],
    'data': [
        'views/loyalty_program_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_loyalty_validity/static/src/overrides/models/pos_order.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
