{
    'name': 'POS Mercado Pago (Alpy)',
    'version': '18.0.1.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Integrate your POS with Mercado Pago Point Smart terminals using the Orders API',
    'description': """
This module integrates Mercado Pago Point Smart terminals with Odoo Point of Sale.
It uses the modern Mercado Pago 'Orders' API (v1/orders) for payment creation and status polling.

Features:
- Payment support via Point Smart terminals
- Real-time status polling
- Webhook support for status updates
- 'Force PDV' mode for terminals
    """,
    'depends': ['point_of_sale'],
    'data': [
        'views/pos_payment_method_views.xml'
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_mercado_pago_alpy/static/src/**/*',
        ],
    },
    'license': 'LGPL-3',
    'installable': True,
    'application': False,
}
