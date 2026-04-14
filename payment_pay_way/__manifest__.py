{
    "name": "Payway payment Provider",
    "summary": """
        Payway payment Provider
        (formely Decidir 2.0)
    """,
    "description": """
        Payway payment Provider
        (formely Decidir 2.0)
    """,
    "author": "Plugberry",
    "website": "https://www.plugberry.com/",
    "category": "Accounting/Payment Providers",
    "version": "18.0.2.0.0",
    "images": ["static/description/thumb.png"],
    "depends": ["payment", "card_installment", "account_debit_note", "phone_validation"],
    "assets": {
        "web.assets_frontend": [
            "payment_pay_way/static/src/js/payment_form.js",
            "payment_pay_way/static/src/js/decidir.js",
        ],
    },
    "data": [
        "security/ir.model.access.csv",
        "views/payment_provider.xml",
        "views/templates.xml",
        "views/account_card.xml",
        "views/payment_transaction.xml",
        "data/payment_method_data.xml",
        "data/payment_provider_data.xml",
    ],
    "demo": [
        "demo/demo.xml",
    ],
    "post_init_hook": "post_init_hook",
    "uninstall_hook": "uninstall_hook",
    "application": False,
    "installable": True,
    "license": "LGPL-3",
}
