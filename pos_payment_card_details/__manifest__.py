{
    'name': 'POS Payment Card Details',
    'version': '19.0.1.1.1',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Add Lot Number, Coupon, and Installments to POS payments for banking conciliation.',
    'description': """
This module allows tracking of advanced terminal details on POS payments, specifically:
- Lot Number
- Coupon Number
- Installments

At session closing, payment methods with "Requires Card Details" enabled generate one
account.payment per lot number (instead of one combined payment per method).
Each payment carries the memo "Lote XXXX — Method (Session)", enabling direct
reconciliation against the card processor settlement report (Fiserv, Prisma, etc.).
    """,
    'author': 'AlparData',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'views/pos_payment_method_views.xml',
        'views/pos_payment_views.xml',
        # 'report/pos_sale_details_views.xml',  # stashed
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_payment_card_details/static/src/app/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
