{
    "name": "POS Restaurant Table Time",
    "version": "18.0.1.0.0",
    "category": "Point of Sale",
    "summary": "Show time passed since the table was occupied",
    "description": "Displays a timer on each occupied table in the POS Restaurant floor screen.",
    "depends": ["pos_restaurant"],
    "data": [],
    "assets": {
        "point_of_sale._assets_pos": [
            "pos_restaurant_table_time/static/src/app/floor_screen/*",
        ],
    },
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
