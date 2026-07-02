{
    'name': 'POS Restaurant KPI',
    'version': '19.0.1.0.1',
    'category': 'Point of Sale',
    'summary': 'Add KPIs to the POS Restaurant Floor Screen (Total Customers and Avg. Consumption)',
    'depends': ['pos_restaurant'],
    'data': [],
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_restaurant_kpi/static/src/app/**/*',
        ],
    },
    'installable': True,
    'license': 'LGPL-3',
}
