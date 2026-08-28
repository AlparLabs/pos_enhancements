{
    'name': 'POS Cash Move Receipt Fix',
    'version': '19.0.1.0.0',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Fix the cash in/out receipt layout when the reason text is long.',
    'description': """
Backport of the upstream fix for the POS cash in/out receipt.

In core 19.0 the AMOUNT and REASON values are rendered as
`<span class="pos-receipt-right-align"/>`, which the POS stylesheet declares as
`float: right; display: flex;`. With a long reason the floated span becomes many
lines tall, so the company footer below it (a `d-flex` container, which does not
overlap floats) is squeezed into the leftover width (~0) and its `w-50 text-break`
columns collapse to one character per line: the address prints vertically.

This module turns both rows into flex containers, exactly as Odoo did upstream.
Floats are ignored on flex items, so the footer keeps its full width.

Remove this module once the running core includes the upstream fix (the core
template already carrying `d-flex justify-content-between gap-2` on those rows).
    """,
    'author': 'AlparData',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_cash_move_receipt_fix/static/src/app/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
