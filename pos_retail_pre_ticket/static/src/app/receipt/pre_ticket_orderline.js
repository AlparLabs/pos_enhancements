/** @odoo-module **/

import { Orderline } from "@point_of_sale/app/components/orderline/orderline";

/**
 * Orderline variant used only on the pre-ticket. It reuses the standard
 * Orderline logic but renders a dedicated template that shows the product's
 * internal reference (default_code) in bold before the product name.
 */
export class PreTicketOrderline extends Orderline {
    static template = "pos_retail_pre_ticket.PreTicketOrderline";
}
