{
    'name': 'POS Hide Combo Subproduct Prices',
    'version': '19.0.2.0.0',
    'category': 'Point of Sale',
    'summary': 'Hide prices and subtotals of combo subproducts on POS receipts',
    'description': """
In Odoo 19 the core POS already implements everything this module did in 18.0:

- Combo child lines return an empty display price
  (PosOrderline.currencyDisplayPrice returns "" when combo_parent_id is set)
  and the Orderline component hides child prices on screen and receipts.
- The combo parent line displays the aggregated total of its children
  (displayPrice sums the children's line totals, so the quantity fix from
  18.0.1.x is also covered).
- Kitchen receipt grouping now lives in pos_kitchen_receipt_grouping.

The module is kept as an empty shell so databases that had it installed can
upgrade to 19.0 without breaking; it can be uninstalled safely afterwards.
    """,
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {},
    'installable': True,
    'license': 'LGPL-3',
}
