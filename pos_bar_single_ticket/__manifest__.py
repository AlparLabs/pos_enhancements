{
    'name': 'POS Bar Single Ticket',
    'version': '18.0.1.1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Print bar tickets only at payment time; supervisor PIN required for reprints.',
    'description': """
When a POS category has "Print Single Ticket" enabled, each unit of product
in that category generates an individual bar ticket printed ONLY when the order
is validated (client pays). This prevents staff from triggering reprints by
deleting and re-adding products.

A "Reimprimir Barra" button (warning colour) appears after payment to allow
supervisors to force-reprint tickets after verifying their PIN.

Example: 3 Mojitos → 3 separate bar tickets printed at checkout.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_restaurant'],
    'data': [
        'views/pos_category_view.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_bar_single_ticket/static/src/app/models/pos_order_line.js',
            'pos_bar_single_ticket/static/src/app/receipt/bar_ticket_receipt.js',
            'pos_bar_single_ticket/static/src/app/receipt/bar_ticket_receipt.xml',
            'pos_bar_single_ticket/static/src/app/utils/bar_ticket_utils.js',
            'pos_bar_single_ticket/static/src/app/control_buttons/bar_ticket_button.js',
            'pos_bar_single_ticket/static/src/app/control_buttons/bar_ticket_button.xml',
            'pos_bar_single_ticket/static/src/app/screens/payment_screen.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
