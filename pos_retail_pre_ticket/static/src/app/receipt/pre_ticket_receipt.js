/** @odoo-module **/

import { Component } from "@odoo/owl";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";

export class PreTicketReceipt extends Component {
    static template = "pos_retail_pre_ticket.PreTicketReceipt";
    static components = {
        ReceiptHeader,
        Orderline,
    };
    static props = {
        data: Object,
        formatCurrency: Function,
    };
}
