{
    'name': 'POS Kitchen Receipt Grouping',
    'version': '19.0.3.0.0',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Group POS kitchen receipts by configurable Kitchen Groups and decompose Combos',
    'description': """
        This module groups the POS kitchen receipt by Kitchen Group, a configurable
        concept (Starters, Mains, Desserts, Extras) assigned on the POS Category and
        optionally overridden per product. Blocks are ordered by the group sequence.
        Inside a block, lines are ordered by the category's Kitchen Sequence, and the
        ones sharing a sequence keep the order they were entered in.
        Categories without a group keep printing under their own name, so the ticket
        looks exactly as before until groups are assigned.
        Combos are decomposed so the sub-products are printed under their respective
        groups, with the combo name printed once as a sub-header above them instead
        of tagged on every single line.
    """,
    'author': 'AlparData',
    'depends': ['point_of_sale', 'pos_restaurant'],
    'data': [
        'security/ir.model.access.csv',
        'security/pos_kitchen_group_security.xml',
        'data/pos_kitchen_group_data.xml',
        'views/pos_kitchen_group_views.xml',
        'views/pos_category_view.xml',
        'views/product_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_kitchen_receipt_grouping/static/src/app/kitchen_group.js',
            'pos_kitchen_receipt_grouping/static/src/app/services/pos_store.js',
            'pos_kitchen_receipt_grouping/static/src/app/printer/order_change_receipt.xml',
        ],
        'web.assets_unit_tests': [
            'pos_kitchen_receipt_grouping/static/tests/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
