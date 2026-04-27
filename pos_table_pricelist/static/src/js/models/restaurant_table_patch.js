/** @odoo-module **/

/**
 * Patch RestaurantTable to load pos_pricelist_id from the server.
 *
 * In Odoo 18 POS, restaurant.table is loaded via the model registry.
 * We patch the model to declare the extra field so the POS data loader
 * includes it in its SELECT when fetching table records.
 */

import { patch } from "@web/core/utils/patch";
import { RestaurantTable } from "@pos_restaurant/app/models/restaurant_table";

patch(RestaurantTable.prototype, {
    /**
     * Return the fields that should be loaded from the server for this model.
     * We extend the default list to include our custom pricelist field.
     */
    get pricelistId() {
        // Convenience getter — returns the raw Many2one value (array or false)
        return this.pos_pricelist_id;
    },
});
