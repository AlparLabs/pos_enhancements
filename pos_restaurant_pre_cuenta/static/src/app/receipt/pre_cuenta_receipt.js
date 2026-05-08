/** @odoo-module **/

import { Component } from "@odoo/owl";

/**
 * PreCuentaReceipt — OWL component for the restaurant pre-bill.
 *
 * Props:
 *   data          — receipt data assembled by PreCuentaButton.click()
 *   formatCurrency — utility function from env.utils
 */
export class PreCuentaReceipt extends Component {
    static template = "pos_restaurant_pre_cuenta.PreCuentaReceipt";
    static components = {};
    static props = {
        data: Object,
        formatCurrency: Function,
    };
}

