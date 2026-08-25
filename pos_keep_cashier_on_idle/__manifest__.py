# -*- coding: utf-8 -*-
{
    'name': 'POS Keep Cashier On Idle',
    'version': '19.0.1.0.0',
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'category': 'Sales/Point of Sale',
    'summary': 'Keep the screensaver but stop logging the cashier out on inactivity',
    'description': """
Odoo 19 logs the cashier out every time the POS idle timer fires.

The idle timer shows the SaverScreen after 5 minutes of inactivity and calls
``navigateToFirstPage()`` on the next user event. The core ``firstPage`` getter
runs ``resetCashier()`` on every call that does not come from the backend
redirect, so waking the screensaver clears the cashier and the register falls
back to the LoginScreen. With ``pos_hr`` installed that means retyping the
employee PIN several times a day.

This module keeps the screensaver but makes waking up non-destructive:

- the cashier survives the wake-up, so no PIN is asked again;
- the register returns to the page it was on when it went idle, instead of the
  core ``defaultPage`` which opens an arbitrary draft order.

Explicit logouts (the Lock/Logout button, closing the register) are untouched.
    """,
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_keep_cashier_on_idle/static/src/app/overrides/models/pos_store.js',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
