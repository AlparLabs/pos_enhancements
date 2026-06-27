/** @odoo-module **/

import { Component } from "@odoo/owl";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";
import { PreTicketOrderline } from "./pre_ticket_orderline";
import { formatCurrency } from "@web/core/currency";

export class PreTicketReceipt extends Component {
    static template = "pos_retail_pre_ticket.PreTicketReceipt";
    static components = { ReceiptHeader, Orderline: PreTicketOrderline };
    static props = {
        order: Object,
    };

    formatCurrency(amount) {
        return formatCurrency(amount, this.props.order.currency.id);
    }
}
