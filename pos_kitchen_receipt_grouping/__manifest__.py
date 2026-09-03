{
    'name': 'POS Kitchen Receipt Grouping',
    'version': '19.0.2.3.1',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Group POS kitchen receipts by POS Category sequence and decompose Combos',
    'description': """
        This module enhances the POS restaurant kitchen ticket by grouping order lines
        by their POS Categories. It also adds a 'Kitchen Sequence' field to the
        POS Categories to allow custom sorting of these groups on the ticket.
        Additionally, it decomposes Combos so the sub-products are printed under
        their respective categories with a reference to the main Combo.
    """,
    'author': 'AlparData',
    'depends': ['point_of_sale', 'pos_restaurant'],
    'data': [
        'views/pos_category_view.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_kitchen_receipt_grouping/static/src/app/services/pos_store.js',
            'pos_kitchen_receipt_grouping/static/src/app/printer/order_change_receipt.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
