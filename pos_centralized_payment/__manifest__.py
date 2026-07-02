{
    'name': 'POS Centralized Payment',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Restricts the Pay button to Manager-role cashiers for centralized cash register setups.',
    'description': """
Designed for retail with multiple sales terminals and a single centralized cash register.
When enabled, the Pay button is hidden from regular cashiers and only visible to employees
with the Manager role configured in POS HR.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_hr', 'pos_retail_pre_ticket'],
    'data': [
        'views/pos_config_views.xml',
        'views/pos_order_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_centralized_payment/static/src/overrides/components/product_screen/product_screen.js',
            'pos_centralized_payment/static/src/overrides/components/product_screen/product_screen.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
