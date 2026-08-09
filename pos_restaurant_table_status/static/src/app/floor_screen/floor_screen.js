/** @odoo-module **/

import { FloorScreen } from "@pos_restaurant/app/screens/floor_screen/floor_screen";
import { patch } from "@web/core/utils/patch";

patch(FloorScreen.prototype, {
    /**
     * Returns an inline style string for the colour overlay injected by
     * floor_screen.xml before the .label (table number) inside .info.
     * DOM order ensures the number renders above the overlay naturally.
     * .info overflow:hidden clips the overlay to the table shape.
     *
     * Priority: verified (teal) > pre-cuenta printed (amber).
     *
     * @param {object} table  restaurant.table record
     * @returns {string}  inline style string or empty string (no overlay)
     */
    getTableStatusStyle(table) {
        const order = table.getOrder?.();
        if (!order) return "";

        const base = `pointer-events: none;`;

        if (order.is_table_verified)  return `${base} background-color: rgba(16, 185, 129, 0.82);`;
        if (order.pre_cuenta_printed) return `${base} background-color: rgba(245, 158, 11, 0.82);`;
        return "";
    },
});
