/** @odoo-module **/

import { Component } from "@odoo/owl";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";

export class BarTicketReceipt extends Component {
    static template = "pos_bar_single_ticket.BarTicketReceipt";
    static components = { ReceiptHeader };
    static props = {
        data: Object,
        formatCurrency: Function,
    };
}
