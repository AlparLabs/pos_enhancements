# -*- coding: utf-8 -*-
from odoo import models, fields


class PosOrder(models.Model):
    _inherit = 'pos.order'

    waiter_id = fields.Many2one(
        'hr.employee',
        string='Waiter',
        help='The employee serving this table.',
        index=True,
    )

    # NOTE: do NOT override pos.order._load_pos_data_fields. For pos.order the
    # core method returns [] which the loader treats as "load ALL fields and
    # relations" (both read([]) and _load_pos_data_relations special-case the
    # empty list); returning a non-empty list switches it to "only these fields"
    # mode and drops core relations such as `lines`, crashing the PoS on open
    # (TypeError: Cannot read properties of undefined (reading 'map') in
    # _computeAllPrices). `waiter_id` is exposed to the front end automatically
    # because all pos.order fields are loaded.
