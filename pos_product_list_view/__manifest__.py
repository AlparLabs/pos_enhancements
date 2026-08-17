{
    'name': 'POS Product List View',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Alternative list view for POS products, with internal reference, UoM, barcode and price columns.',
    'description': """
Adds a list view mode to the POS product screen, alongside the native card grid:
- Aligned columns: product, internal reference, unit of measure, barcode, price.
- The native grid shows no price at all; the list does.
- Each column is toggled from the POS settings; the default view is per POS, and the
  cashier's choice is remembered per device.
- Rows keep the native click-to-add and long-press-for-product-info behaviour.
    """,
    'author': 'AlparData',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_product_list_view/static/src/app/**/*',
            'pos_product_list_view/static/src/scss/**/*',
        ],
        'web.assets_unit_tests': [
            'pos_product_list_view/static/tests/**/*',
        ],
        'web.assets_tests': [
            'pos_product_list_view/static/tours/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
