{
    'name': 'POS Cash Move Reason',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Configurable concept buttons for POS cash in/out, with preset counterpart account.',
    'description': """
Adds configurable concept buttons to the POS cash in/out popup, in the spirit of
the reconciliation model buttons of the bank reconciliation widget.

Each concept carries a preset counterpart account and, optionally, a contact.
When the cashier picks one, the resulting journal entry is posted straight against
that account instead of the cash journal's suspense account — no manual
reconciliation afterwards, and no free-text typos in the movement reason.

Concepts without an account behave exactly like today (they land in the suspense
account) and only serve as label shortcuts, so the catalogue can be rolled out
before every account is decided.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'security/ir.model.access.csv',
        'views/pos_cash_move_reason_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_cash_move_reason/static/src/app/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
