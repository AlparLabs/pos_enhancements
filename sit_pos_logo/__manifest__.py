# -*- coding: utf-8 -*-
{
    'name': 'SIT POS Logo Customization',
    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Logo personalizado por sesión del punto de venta',
    'description': """
        Módulo para personalizar el logotipo mostrado en el punto de venta.
        
        Características principales:
        • Logo personalizado por cada sesión POS individual
        • Configuración independiente por punto de venta
        • Interfaz de configuración fácil con vista previa
        • Fallback automático al logo de la empresa
        • Responsive design para tablets y móviles
        • Compatible con Odoo 18.0
        • Carga optimizada con sistema de cache
        • Soporte para múltiples formatos de imagen
        
        Casos de uso:
        - Múltiples tiendas con identidad visual propia
        - Empresas con diferentes marcas por ubicación
        - Logos temporales para eventos especiales
        - Personalización por franquicias
    """,
    'author': 'Service-IT - Biotecnologia',
    'website': 'https://service-it.pe',
    'license': 'LGPL-3',
    'price': 10.00,
    'currency': 'USD',
    'depends': ['base', 'point_of_sale'],
    'data': [
        'views/pos_config_views.xml',
        'views/pos_templates.xml',
    ],
    'images': ['static/description/images.png'],
    'assets': {
        'point_of_sale._assets_pos': [
            'sit_pos_logo/static/src/css/pos_custom.css',
            'sit_pos_logo/static/src/js/pos_logo.js',
            'sit_pos_logo/static/src/xml/pos_navbar.xml',
        ],
        'web.assets_backend': [
            'sit_pos_logo/static/src/css/pos_custom.css',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}