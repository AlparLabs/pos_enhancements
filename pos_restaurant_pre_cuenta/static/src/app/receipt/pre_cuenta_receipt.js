/** @odoo-module **/

import { Component } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";

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
