{
    'name': 'POS Bar Single Ticket',
    'version': '19.0.2.1.2',
    'category': 'Sales/Point of Sale',
    'summary': 'Print bar tickets only at payment time; supervisor PIN required for reprints.',
    'description': """
When a POS category has "Print Single Ticket" enabled, each unit of product
in that category generates an individual bar ticket printed ONLY when the order
is validated (client pays). This prevents staff from triggering reprints by
deleting and re-adding products.

A "Reimprimir Barra" button (warning colour) appears after payment to allow
supervisors to force-reprint tickets after verifying their PIN.

Bar tickets are issued for direct sales only. Orders attached to a restaurant
table are served through the regular kitchen/bar flow and never emit them.

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
            'pos_bar_single_ticket/static/src/app/receipt/bar_ticket_receipt.js',
            'pos_bar_single_ticket/static/src/app/receipt/bar_ticket_receipt.xml',
            'pos_bar_single_ticket/static/src/app/utils/bar_ticket_utils.js',
            'pos_bar_single_ticket/static/src/app/control_buttons/bar_ticket_button.js',
            'pos_bar_single_ticket/static/src/app/control_buttons/bar_ticket_button.xml',
            'pos_bar_single_ticket/static/src/app/screens/payment_screen.js',
            'pos_bar_single_ticket/static/src/app/screens/ticket_screen/ticket_screen.js',
            'pos_bar_single_ticket/static/src/app/screens/ticket_screen/ticket_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
