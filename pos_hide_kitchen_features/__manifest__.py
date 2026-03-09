{
    'name': 'POS Hide Kitchen Features',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Hides the Kitchen Notes and Order buttons in POS Restaurant for retail use',
    'description': """
This module removes the Kitchen Notes and Order buttons from the Point of Sale interface,
which are typically present when using pos_restaurant but not needed for retail operations.
    """,
    'author': 'AlparData',
    'depends': ['point_of_sale', 'pos_restaurant'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_hide_kitchen_features/static/src/css/pos_hide_buttons.css',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
