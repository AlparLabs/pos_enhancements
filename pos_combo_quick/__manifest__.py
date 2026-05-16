{
    'name': 'POS Combo Quick Select',
    'version': '19.0.1.0.0',
    'summary': 'Selección rápida de combos: cantidad + distribución en una sola pantalla',
    'description': """
        Replaces the repetitive native combo popup with a single quick-select screen.
        The cashier picks the total quantity and distributes choices across all combo
        groups in one shot. Identical configurations are automatically grouped into a
        single order line (qty > 1) to keep the order clean.
    """,
    'category': 'Point of Sale',
    'depends': ['point_of_sale'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            # Order matters: styles → template → component → patch
            'pos_combo_quick/static/src/combo_quick_popup/ComboQuickPopup.scss',
            'pos_combo_quick/static/src/combo_quick_popup/ComboQuickPopup.xml',
            'pos_combo_quick/static/src/combo_quick_popup/ComboQuickPopup.js',
            'pos_combo_quick/static/src/patches/product_screen_patch.js',
        ],
    },
    'license': 'LGPL-3',
    'installable': True,
    'auto_install': False,
}
