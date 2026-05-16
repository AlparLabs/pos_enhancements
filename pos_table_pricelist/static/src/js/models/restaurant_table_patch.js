/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { RestaurantTable } from "@pos_restaurant/app/models/restaurant_table";

patch(RestaurantTable.prototype, {
    get pricelistId() {
        return this.pos_pricelist_id;
    },
});
