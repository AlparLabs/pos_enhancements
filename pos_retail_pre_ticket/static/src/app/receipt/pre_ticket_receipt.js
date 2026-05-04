/** @odoo-module **/

import { Component } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/generic_components/orderline/orderline";

export class PreTicketReceipt extends Component {
    static template = "pos_retail_pre_ticket.PreTicketReceipt";
    static components = {
        Orderline,
    };
    static props = {
        data: Object,
        formatCurrency: Function,
    };
}
