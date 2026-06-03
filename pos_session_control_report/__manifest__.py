{
    'name': 'POS Session Control Report',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Customised POS closing receipt and slim session-control PDF.',
    'description': """
        Two improvements to the POS closing report workflow:

        1. **Modified closing receipt (thermal)** – removes the product-by-product
           and tax detail sections; keeps Payments, Discounts, Cash Control
           (expected vs. counted, difference) and Opening/Closing notes.

        2. **"Control Sesión" PDF button** – added to the closing popup next to
           the existing "Daily Sale" button.  The new PDF only shows Payments,
           Discounts, and the Session-Control section, making it ideal for a
           concise end-of-shift summary.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale'],
    'data': [
        'report/report_session_control.xml',
        'views/report_session_control_template.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_session_control_report/static/src/app/closing_popup/closing_popup_patch.js',
            'pos_session_control_report/static/src/app/closing_popup/closing_popup_patch.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
