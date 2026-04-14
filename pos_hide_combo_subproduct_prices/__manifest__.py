{
    'name': 'POS Hide Combo Subproduct Prices',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Hide prices and subtotals of combo subproducts on POS receipts',
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_hide_combo_subproduct_prices/static/src/app/models/pos_orderline.js',
            'pos_hide_combo_subproduct_prices/static/src/app/models/pos_order.js',
            'pos_hide_combo_subproduct_prices/static/src/app/screens/receipt_screen/receipt/order_receipt.xml',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
