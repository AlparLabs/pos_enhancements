/** @odoo-module **/

import { Component } from "@odoo/owl";

const { DateTime } = luxon;

/**
 * Isolated one-unit bar ticket for a single order line.
 * Reads everything from the pos.order / pos.order.line records.
 */
export class BarTicketReceipt extends Component {
    static template = "pos_bar_single_ticket.BarTicketReceipt";
    static props = {
        order: { type: Object, required: true },
        line: { type: Object, required: true },
    };

    get posName() {
        const order = this.props.order;
        return order.config_id?.name || order.config?.name || "";
    }

    get productName() {
        return this.props.line.getFullProductName();
    }

    get lotNames() {
        return (this.props.line.pack_lot_ids || [])
            .map((lot) => lot.lot_name)
            .filter(Boolean);
    }

    get orderName() {
        const order = this.props.order;
        return order.getName?.() || order.pos_reference || "";
    }

    get dateStr() {
        return DateTime.now().toFormat("dd/MM/yyyy HH:mm");
    }
}
