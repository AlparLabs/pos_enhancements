/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";

patch(FloorScreen.prototype, {
    /**
     * Returns an inline style string for the full-coverage overlay div that
     * is injected inside each table tile by floor_screen.xml.
     *
     * The overlay sits at z-index:1 (below the time/waiter badges at z:10)
     * and uses pointer-events:none so clicks pass through to the table div.
     * border-radius mirrors the core table shape logic (round tables get 1000px).
     *
     * Priority: verified (teal) > pre-cuenta printed (amber).
     *
     * @param {object} table  restaurant.table record
     * @returns {string}  inline style string or empty string (overlay hidden)
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
