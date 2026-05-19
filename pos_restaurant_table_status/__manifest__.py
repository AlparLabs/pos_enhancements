{
    'name': 'POS Restaurant Table Status',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Adds table-level status indicators to the restaurant floor screen.',
    'description': """
        Provides two visual status signals for restaurant waiters and cashiers:

        1. **Verified / Checked** — A "Verificar Mesa" button in the order
           control buttons lets staff mark a table as checked. The table tile
           turns teal on the floor screen when verified.

        2. **Pre-Cuenta Printed** — When the Pre-Cuenta (bill preview) is
           printed via pos_restaurant_pre_cuenta, the table tile turns amber
           so all staff know the guest has already received the bill.

        Can be used standalone (the Pre-Cuenta colour only activates when
        pos_restaurant_pre_cuenta is also installed).
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': [
        'pos_restaurant',
    ],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_table_status/static/src/app/table_status_button/table_status_button.js',
            'pos_restaurant_table_status/static/src/app/table_status_button/table_status_button.xml',
            'pos_restaurant_table_status/static/src/app/floor_screen/floor_screen.js',
            'pos_restaurant_table_status/static/src/app/floor_screen/floor_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
