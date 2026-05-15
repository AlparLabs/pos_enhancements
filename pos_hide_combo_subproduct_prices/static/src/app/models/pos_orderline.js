/** @odoo-module **/

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";
import { formatCurrency } from "@point_of_sale/app/models/utils/currency";

/**
 * In Odoo 18, PosOrderline.getPriceString() deliberately returns ""
 * for combo parent lines (those with combo_line_ids.length > 0),
 * because the standard receipt shows sub-product prices instead.
 *
 * We override getDisplayData() to inject the total combo price on the
 * parent line so it shows the full value instead of being blank.
 */
patch(PosOrderline.prototype, {
    getDisplayData() {
        const data = super.getDisplayData(...arguments);

        // If this line is a combo parent (has children), inject the total price.
        // getComboTotalPrice() uses get_all_prices(1) — a per-unit value — so
        // multiply by qty to get the correct line total for data.price.
        if (this.combo_line_ids?.length > 0) {
            const unitTotal = this.getComboTotalPrice?.();
            if (unitTotal !== undefined) {
                data.price = formatCurrency(unitTotal * this.qty, this.currency);
            }
        }

        return data;
    },
});
