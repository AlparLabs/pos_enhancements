{
    'name': 'POS Restaurant Split Bill Combo Fix',
    'version': '19.0.2.0.0',
    'category': 'Point of Sale',
    'summary': 'Fix combo lines getting corrupted when splitting a restaurant table',
    'description': """
In Odoo 19 the core POS already fixes the bug this module patched in 18.0:

``SplitBillScreen._createNewSplitOrder`` (pos_restaurant) now copies each line
from ``line.raw``, explicitly drops ``combo_line_ids`` before creating the new
line ("Combo lines will be relinked by the children") and rebuilds the combo
parent/child links inside the new order through a ``comboMap`` keyed by the
original child uuids. The two orders' combo trees can no longer be cross-wired,
which was the corruption (stray children at catalog price, later crash in
``prepareBaseLineForTaxesComputationExtraValues``) that the 18.0 override of
``createSplittedOrder`` worked around.

The module is kept as an empty shell so databases that had it installed can
upgrade to 19.0 without breaking; it can be uninstalled safely afterwards.
    """,
    'author': 'Alpar Data',
    'depends': ['pos_restaurant'],
    'data': [],
    'assets': {},
    'installable': True,
    'license': 'LGPL-3',
}
