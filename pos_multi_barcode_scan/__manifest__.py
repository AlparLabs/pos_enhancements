# -*- coding: utf-8 -*-
{
    'name': 'POS Multi Barcode Scan',
    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Scan a single QR code containing multiple barcodes (e.g. client and coupon)',
    'description': 'Allows the POS barcode scanner to process a single string with multiple barcodes separated by a pipe (|).',
    'author': 'AlparData',
    'depends': ['point_of_sale'],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_multi_barcode_scan/static/src/app/barcode_reader_patch.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
