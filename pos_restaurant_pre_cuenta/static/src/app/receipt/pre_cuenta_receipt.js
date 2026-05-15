/** @odoo-module **/

import { Component } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { formatCurrency } from "@point_of_sale/app/models/utils/currency";

// Fix combo parent line price display: show correct unit price and line total.
// getComboTotalPrice() uses get_all_prices(1) so it is always per-unit.
patch(PosOrderline.prototype, {
    getDisplayData() {
        const data = super.getDisplayData(...arguments);
        if (this.combo_line_ids?.length > 0) {
            const unitTotal = this.getComboTotalPrice?.();
            if (unitTotal !== undefined) {
                data.unitPrice = formatCurrency(unitTotal, this.currency);
                data.price = formatCurrency(unitTotal * this.qty, this.currency);
            }
        }
        return data;
    },
});

/**
 * PreCuentaReceipt — OWL component for the restaurant pre-bill.
 *
 * Props:
 *   data          — receipt data assembled by PreCuentaButton.click()
 *   formatCurrency — utility function from env.utils
 */
export class PreCuentaReceipt extends Component {
    static template = "pos_restaurant_pre_cuenta.PreCuentaReceipt";
    static components = { Orderline };
    static props = {
        data: Object,
        formatCurrency: Function,
    };
}
