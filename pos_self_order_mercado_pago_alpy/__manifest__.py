{
    'name': 'POS Self Order Mercado Pago Alpy',
    'version': '18.0.1.0',
    'summary': 'Kiosk self-order support for Mercado Pago Point Smart terminals (async)',
    'category': 'Sales/Point Of Sale',
    'depends': ['pos_mercado_pago_alpy', 'pos_self_order'],
    'auto_install': True,
    'assets': {
        'pos_self_order.assets': [
            'pos_self_order_mercado_pago_alpy/static/src/**/*',
        ],
    },
    'license': 'LGPL-3',
    'installable': True,
    'application': False,
}
