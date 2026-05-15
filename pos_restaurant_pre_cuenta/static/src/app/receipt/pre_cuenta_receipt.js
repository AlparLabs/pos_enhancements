/** @odoo-module **/

import { Component } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";
import { patch } from "@web/core/utils/patch";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { formatCurrency } from "@point_of_sale/app/models/utils/currency";

// Show the full combo unit price on the parent line instead of $0.00.
patch(PosOrderline.prototype, {
    getDisplayData() {
        const data = super.getDisplayData(...arguments);
        if (this.combo_line_ids?.length > 0) {
            const total = this.getComboTotalPrice?.();
            if (total !== undefined) {
                data.unitPrice = formatCurrency(total, this.currency);
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
