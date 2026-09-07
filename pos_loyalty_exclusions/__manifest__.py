{
    'name': 'POS Loyalty Retail Exclusions & Margin Protection',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Exclude categories/products (tobacco, phone recharges) and prevent stacking on already-discounted items in POS loyalty.',
    'description': """
POS Loyalty Retail Exclusions & Margin Protection
=================================================
Provides margin protection for retail and supermarket point of sale:
- Exclude specific product categories (e.g., Cigarettes/Tobacco, Phone Recharges, Price-Controlled items) or specific products from loyalty rewards and rule calculations.
- Pre-computes category hierarchies in the backend for instant O(1) performance during fast supermarket checkout.
- Non-cumulative control: option to exclude lines that already have discounts or promotions from receiving additional reward discounts.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_loyalty', 'loyalty'],
    'data': [
        'views/loyalty_rule_views.xml',
        'views/loyalty_reward_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_loyalty_exclusions/static/src/overrides/models/pos_order.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
