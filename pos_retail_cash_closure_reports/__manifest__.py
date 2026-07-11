{
    'name': 'POS Retail Cash Closure Reports',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Combined cash closure + per-salesperson sales PDF report for retail POS.',
    'description': """
        A single "Cierre de Caja" PDF report for the POS closing workflow,
        tailored for a retail setup with counter salespeople sending orders
        to a centralized cashier. It combines two sections:

        1. **Rendicion de Caja** - opening/expected/counted cash balance per
           cash payment method, plus a detailed list of cash in/out
           movements (retiros e ingresos) with date/time, type and reason.

        2. **Ventas x Vendedor** - the day's sales grouped by counter
           salesperson (counter_salesperson_id), each with the invoice/order
           reference per sale and totals by payment method.

        Downloadable from the closing popup and from the "Print" menu of
        the POS Session backend form.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_centralized_payment'],
    'data': [
        'report/report_cash_closure_full.xml',
        'views/report_cash_closure_template.xml',
        'views/report_sales_by_salesperson_template.xml',
        'views/report_cash_closure_full_template.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.js',
            'pos_retail_cash_closure_reports/static/src/app/closing_popup/closing_popup_patch.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
