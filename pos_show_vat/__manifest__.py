{
    'name': 'POS Show VAT/CUIT',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Display customer VAT/CUIT in POS partner list',
    'description': """
        This module adds the VAT/CUIT field to the customer list in Point of Sale.
        The VAT is displayed alongside customer name, address, phone, and email.
    """,
    'author': 'Santiago',
    'depends': ['point_of_sale'],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_search_vat/static/src/xml/partner_line.xml',
        ],
    },
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}