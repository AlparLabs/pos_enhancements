/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";

patch(FloorScreen.prototype, {
    /**
     * Returns an inline style string for the full-coverage overlay div injected
     * inside each table tile. Priority: verified (teal) > pre-cuenta printed (amber).
     * Returns empty string when no status applies (overlay hidden).
     *
     * @param {object} table  restaurant.table record
     * @returns {string}
     */
    getTableStatusStyle(table) {
        const order = table.getOrder?.();
        if (!order) return "";

        const radius = table.shape === "round" ? "1000px" : "3px";
        const base = `pointer-events: none; z-index: 1; border-radius: ${radius};`;

        if (order.is_table_verified)  return `${base} background-color: rgba(16, 185, 129, 0.82);`;
        if (order.pre_cuenta_printed) return `${base} background-color: rgba(245, 158, 11, 0.82);`;
        return "";
    },
});
