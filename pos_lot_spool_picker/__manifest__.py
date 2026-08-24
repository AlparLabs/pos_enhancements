{
    'name': 'POS Lot Spool Picker',
    'version': '19.0.1.1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Pick lot-tracked products (cable spools) by remaining meters and location, split a sale across bobinas.',
    'description': """
Replaces the native POS lot popup for lot/serial-tracked products with a spool picker:
- Lists available lots (bobinas) with remaining meters and storage location.
- Auto-suggests the smallest lot that still covers the requested meters (anti-retazo).
- Splits one sale across several lots while keeping a single customer-facing line.
- Warns (default) or blocks (per POS config) when the assignment exceeds real stock.
    """,
    'author': 'AlparData',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'stock'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_lot_spool_picker/static/src/app/**/*',
        ],
        'web.assets_unit_tests': [
            'pos_lot_spool_picker/static/tests/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
