"""Drop the reconciliation columns left behind by the settlement split.

Odoo normally does this by itself: once the fields are gone from the code
their ir.model.data xmlids are no longer loaded, ir.model.data._process_end()
unlinks the matching ir.model.fields records, and IrModelFields.unlink() calls
_drop_column(), which issues the ALTER TABLE.

This script is a safety net for the cases where that cleanup does not run --
an update with import_partial, or a database where the fields were flagged
noupdate or the module was force-removed. It is idempotent and will normally
find nothing to do.
"""

from odoo.tools import SQL, sql

TABLE = 'pos_payment'
COLUMNS = (
    'mp_net_amount',
    'mp_fee_amount',
    'mp_release_date',
    'mp_status_detail',
    'mp_info_fetched',
)


def migrate(cr, version):
    for column in COLUMNS:
        if sql.column_exists(cr, TABLE, column):
            cr.execute(SQL(
                'ALTER TABLE %s DROP COLUMN %s CASCADE',
                SQL.identifier(TABLE),
                SQL.identifier(column),
            ))
