{
    'name': 'POS Mercado Pago (Alpy)',
    'version': '19.0.3.1',
    'category': 'Sales/Point of Sale',
    'summary': 'Integrate your POS with Mercado Pago: Point Smart terminals and QR code payments',
    'description': """
This module integrates Mercado Pago with Odoo Point of Sale.

Payment modalities:
- Terminal Smart  : Point Smart terminal via Orders API (/v1/orders)
- QR Local        : Sends the amount to the physical QR code in the store (Instore QR API)
- QR en Pantalla  : Renders the QR on the POS screen so the customer can scan it
- QR Híbrido      : Combines both — amount sent to the physical QR and rendered on screen

Features:
- Real-time webhooks (merchant_order for QR, Orders API for Terminal)
- Fallback polling for unstable networks
- 'Force PDV' mode for Point Smart terminals
- Idempotency keys for safe retries
    """,
    'depends': ['point_of_sale'],
    'data': [
        'views/pos_payment_method_views.xml',
        'views/pos_payment_views.xml',
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
