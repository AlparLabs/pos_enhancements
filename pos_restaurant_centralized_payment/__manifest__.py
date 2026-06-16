{
    'name': 'POS Restaurant Centralized Payment',
    'version': '18.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Restricts Pay button to Manager cashiers; waiter terminals use "Enviar a Caja".',
    'description': """
Designed for restaurants with multiple waiter terminals and a single cash register.
When "Pago Centralizado" is enabled in POS settings:
  - Non-manager cashiers see "Enviar a Caja" instead of the Pay button.
  - "Enviar a Caja" prints the pre-cuenta and returns to the floor plan.
  - Manager cashiers see Pay normally and process payment from the floor.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['pos_restaurant', 'pos_hr', 'pos_restaurant_pre_cuenta'],
    'data': [
        'views/pos_config_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.js',
            'pos_restaurant_centralized_payment/static/src/overrides/product_screen/product_screen.xml',
            'pos_restaurant_centralized_payment/static/src/overrides/product_screen/actionpad_widget.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
