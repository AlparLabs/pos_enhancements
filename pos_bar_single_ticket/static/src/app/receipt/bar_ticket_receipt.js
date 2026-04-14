/** @odoo-module **/

import { Component } from "@odoo/owl";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";

/**
 * @typedef {Object} BarTicketReceiptProps
 * @property {Object} data
 * @property {Function} formatCurrency
 */

export class BarTicketReceipt extends Component {
    static template = "pos_bar_single_ticket.BarTicketReceipt";
    static components = { ReceiptHeader };
    
    /** @type {BarTicketReceiptProps} */
    static props = {
        data: { type: Object, required: true },
        formatCurrency: { type: Function, required: true },
    };
}
