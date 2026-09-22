/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/screens/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";

patch(FloorScreen.prototype, {
    /**
     * Returns the name of the assigned customer for the active order on this table.
     *
     * @param {object} table restaurant.table record
     * @returns {string} Customer name, or empty string if no customer is assigned
     */
    getTableCustomerName(table) {
        const order = table.getOrder?.();
        if (!order || order.finalized || (order.state && order.state !== "draft")) {
            return "";
        }
        const partner = order.partner_id || (order.getPartner && order.getPartner());
        return partner?.name || "";
    },
});
