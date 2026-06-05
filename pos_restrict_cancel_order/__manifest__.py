{
    'name': 'POS Restrict Cancel Order',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Restricts order cancellation to Manager-role cashiers in POS.',
    'description': """
Hides the Cancel Order button from non-manager cashiers.
When a manager cancels a synced order, a timestamped note is posted to the
order chatter in the Odoo backend. Requires pos_hr enabled in POS config.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_hr'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.js',
            'pos_restrict_cancel_order/static/src/overrides/control_buttons/control_buttons.xml',
            'pos_restrict_cancel_order/static/src/overrides/ticket_screen/ticket_screen.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
