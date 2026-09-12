# -*- coding: utf-8 -*-
{
    'name': 'POS Restaurant Sync Safeguard',
    'version': '19.0.1.0.1',
    'category': 'Sales/Point of Sale',
    'summary': 'Resilient kitchen printing with LAN timeout, UI lock auto-release and FloorScreen auto-heal.',
    'description': """
POS Restaurant Sync Safeguard & Resilience
==========================================
Protects the restaurant POS workflow in multi-terminal setups and high-latency environments (such as Odoo.sh):

1. **Fail-Safe Kitchen Printing with Timeout:**
   Wraps local LAN/thermal order printers with a 3.5-second execution timeout. If a bar or
   kitchen printer is unreachable, out of paper, or experiences network lag, the error is
   caught gracefully with a non-blocking user warning instead of hanging the entire POS or
   aborting server synchronization.

2. **UI Lock Auto-Release:**
   Guarantees that order submitting/syncing flags (`isSubmitting`, `isSending`, `syncing`) are
   always cleared in a `finally` block. Staff never gets permanently locked out of a table
   saying "sincronizando/enviando", eliminating the need for hard browser refreshes (F5).

3. **Floor Screen Auto-Heal:**
   Refreshes active draft table orders upon floor screen mount and when devices recover
   visibility (e.g. waking up a tablet screen), protecting against zombie WebSocket connections
   and ensuring tables opened on one terminal appear consistently across all screens.
    """,
    'author': 'AlparData',
    'website': 'https://www.alpardata.com.ar',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'pos_restaurant',
    ],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_sync_safeguard/static/src/app/services/pos_store_safeguard.js',
            'pos_restaurant_sync_safeguard/static/src/app/screens/floor_screen_safeguard.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
