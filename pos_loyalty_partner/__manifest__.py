{
    'name': 'POS Loyalty Partner / Customer Segmentation',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Filter loyalty and discount rules by partner tags or specific partners in POS.',
    'description': """
POS Loyalty Partner / Customer Segmentation
===========================================
Allows loyalty and discount program rules to be restricted to specific partners or partner categories/tags (such as Family, Owners, Employees, VIP).
In the Point of Sale, rewards are automatically granted when an eligible partner is selected and removed if unselected.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_loyalty', 'loyalty'],
    'data': [
        'views/loyalty_rule_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_loyalty_partner/static/src/overrides/models/pos_order.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
