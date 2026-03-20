/** @odoo-module **/

import { RestaurantTable } from "@pos_restaurant/app/models/restaurant_table";
import { patch } from "@web/core/utils/patch";

patch(RestaurantTable.prototype, {
    getOrder() {
        return (
            this.parent_id?.getOrder?.() || (this["<-pos.order.table_id"] || []).find((o) => !o.finalized)
        );
    }
});
