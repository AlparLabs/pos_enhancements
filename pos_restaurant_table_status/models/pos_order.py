# -*- coding: utf-8 -*-
from odoo import models, fields


class PosOrder(models.Model):
    _inherit = 'pos.order'

    is_table_verified = fields.Boolean(
        string='Table Verified',
        default=False,
        help='Set by the waiter to mark this table as checked / verified.',
    )

    pre_cuenta_printed = fields.Boolean(
        string='Pre-Cuenta Printed',
        default=False,
        help='Set automatically when the Pre-Cuenta is printed for this order.',
    )

    # NOTE: do NOT override pos.order._load_pos_data_fields. For pos.order the
    # core method returns [] which the loader treats as "load ALL fields and
    # relations"; returning a non-empty list switches it to "only these fields"
    # mode and drops core relations such as `lines`, crashing the PoS on open
    # (TypeError: Cannot read properties of undefined (reading 'map') in
    # _computeAllPrices). The two booleans above are exposed to the front end
    # automatically because all pos.order fields are loaded.
