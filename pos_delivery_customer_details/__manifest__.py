# -*- coding: utf-8 -*-
{
    'name': 'POS Delivery Customer Details',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Imprime datos completos del cliente en comandas de cocina y tickets de venta',
    'description': """
        Módulo para Puntos de Venta con servicio de entrega o delivery.
        Agrega un check de configuración en el POS para imprimir:
        - Nombre / Razón Social
        - Calle, número y piso/departamento (street y street2)
        - Ciudad, provincia y código postal
        - Teléfono de contacto
        - Correo electrónico
        En:
        1. Comandas de cocina / preparación (OrderChangeReceipt)
        2. Tickets de cierre de venta (OrderReceipt)
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'depends': ['point_of_sale'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_delivery_customer_details/static/src/app/**/*.js',
            'pos_delivery_customer_details/static/src/app/**/*.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
