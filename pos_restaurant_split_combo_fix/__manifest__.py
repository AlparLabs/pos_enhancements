{
    'name': 'POS Restaurant Split Bill Combo Fix',
    'version': '18.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Fix combo lines getting corrupted when splitting a restaurant table',
    'description': """
POS Restaurant - Split Bill Combo Fix
=====================================

When splitting a restaurant table whose order contains combo products
(e.g. a "Menú Ejecutivo" = main course + drink), the standard Odoo 18
``SplitBillScreen.createSplittedOrder`` serializes each order line and
re-creates it on the new order with ``fromSerialized=true``. The serialized
data still carries ``combo_parent_id`` / ``combo_line_ids`` pointing at the
*original* order's lines, so the framework cross-wires the two orders'
combo structures:

* the original combo children lose their parent and render as stray
  standalone lines priced at their catalog price ("added as extras"), and
* setting quantity / removing a line later throws
  ``Cannot read properties of undefined (reading 'config')`` in
  ``prepareBaseLineForTaxesComputationExtraValues`` because
  ``getComboTotalPrice`` walks an orphaned child whose ``order_id`` is gone.

This module overrides ``createSplittedOrder`` to strip the combo relations
before creating the new lines and then rebuilds the parent/child links
*within the new order only*, leaving the original order's combo intact.
""",
    'author': 'Alpar Data',
    'depends': ['pos_restaurant'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_split_combo_fix/static/src/app/split_bill_screen/split_bill_screen.js',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
