{
    'name': 'POS Bar Single Ticket',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Print one ticket per unit for selected POS categories (bar tickets).',
    'description': """
When a POS category has "Print Single Ticket" enabled, each unit of product
in that category generates an individual kitchen/bar ticket instead of a
single ticket with the total quantity.

Example: 3 Mojitos → 3 separate bar tickets, each showing qty 1.
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
            'pos_bar_single_ticket/static/src/overrides/pos_store.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
