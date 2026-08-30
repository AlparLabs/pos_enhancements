{
    'name': 'POS Cash Move Reason',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Concept buttons for POS cash in/out, to standardise the movement label.',
    'description': """
Adds configurable concept buttons to the POS cash in/out popup. Tapping one writes
the concept's code between square brackets at the front of the reason:

    [PROVEEDORES] Distribuidora Lopez, factura 0001-00034

The cashier keeps typing whatever detail they want after the code.

The module writes nothing accounting: the movement still posts against the cash
journal's suspense account, like stock Odoo. The imputation is configured in
Accounting with native reconciliation models that match on the [CODE] prefix, which
is the accountant's territory and deliberately out of this module.
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
