# -*- coding: utf-8 -*-
# Part of Creyox Technologies.

{
    "name": "POS KOT KDS Sequence Generator | OrderFlow Sequence Manager for POS | Smart KDS Order Sequencer | POS Sequence Display for KDS",
    "version": "18.0.0.1",
    "category": "Sales/Point of Sale",
    "author": "Creyox Technologies",
    "website": "https://www.creyox.com",
    "support": "support@creyox.com",
    "summary": """ 
        The POS KOT KDS Sequence Generator module for Odoo 17 generates unique sequence numbers for each order in a restaurant\'s POS system. These sequence numbers help organize and display orders in the kitchen display system (KDS), streamlining order tracking and preparation in a busy kitchen environment.

        Order Sequence Tracker for POS KDS
        Smart KDS Order Sequencer
        POS Kitchen Display Sequence Manager
        QuickServe POS Order Sequencer
        Kitchen Order Number Generator
        POS Sequence Display for KDS
        FastTrack Order Sequencer for Kitchen Display
        Kitchen Queue Sequence Generator
        OrderFlow Sequence Manager for POS
        Kitchen Order Tracker for Odoo POS
        """,
    "description": """ 
        The POS KOT KDS Sequence Generator module for Odoo 17 generates unique sequence numbers for each order in a restaurant's POS system. These sequence numbers help organize and display orders in the kitchen display system (KDS), streamlining order tracking and preparation in a busy kitchen environment.

        Order Sequence Tracker for POS KDS
        Smart KDS Order Sequencer
        POS Kitchen Display Sequence Manager
        QuickServe POS Order Sequencer
        Kitchen Order Number Generator
        POS Sequence Display for KDS
        FastTrack Order Sequencer for Kitchen Display
        Kitchen Queue Sequence Generator
        OrderFlow Sequence Manager for POS
        Kitchen Order Tracker for Odoo POS
    """,
    "depends": [
        "point_of_sale",
        "pos_preparation_display",
        "pos_restaurant",
        "pos_sale",
    ],
    "data": [
        "data/ir_sequence.xml",
        "views/pos_order.xml",
    ],
    "assets": {
        "pos_preparation_display.assets": [
            "pos_kot_kds_seq_generator/static/src/apps/**/*",
        ],
        "point_of_sale._assets_pos": [
            "pos_kot_kds_seq_generator/static/src/component/**/*",
        ],
    },
    "installable": True,
    "auto_install": False,
    "application": True,
    "images": ["static/description/banner.png"],
    "price": 0,
    "currency": "USD",
    "license": "OPL-1",
}
