{
    'name': 'POS Multi Barcode Scan',
    'version': '19.0.1.1.0',
    'category': 'Point of Sale',
    'summary': 'Scan a single QR code containing multiple barcodes (e.g. client and coupon)',
    'description': (
        'Allows the POS barcode scanner to process a single QR code containing multiple '
        'barcodes separated by a configurable character (default: |). '
        'The separator is configured directly on the Barcode Nomenclature.'
    ),
    'author': 'AlparData',
    'depends': ['point_of_sale'],
    'data': [
        'views/barcode_nomenclature_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_multi_barcode_scan/static/src/app/barcode_parser_patch.js',
            'pos_multi_barcode_scan/static/src/app/barcode_reader_patch.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
