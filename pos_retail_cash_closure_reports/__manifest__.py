{
    'name': 'POS Retail Cash Closure Reports',
    'version': '19.0.1.0.0',
    'category': 'Sales/Point of Sale',
    'summary': 'Cash closure and per-salesperson sales PDF reports for retail POS.',
    'description': """
        Two PDF reports for the POS closing workflow, tailored for a retail
        setup with counter salespeople sending orders to a centralized
        cashier:

        1. **Rendicion de Caja** - opening/expected/counted cash balance per
           cash payment method, plus a detailed list of cash in/out
           movements (retiros e ingresos) with date/time, type and reason.

        2. **Ventas x Vendedor** - the day's sales grouped by counter
           salesperson (counter_salesperson_id), each group totaled by
           payment method.

        Both reports are downloadable from the closing popup and from the
        "Print" menu of the POS Session backend form.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'pos_centralized_payment'],
    'data': [],
    'installable': True,
    'application': False,
    'auto_install': False,
}
