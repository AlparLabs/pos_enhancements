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

    /**
     * Odoo receipt number of the sale, e.g. "260-16-000002" — the same value
     * the customer receipt and the backend show for the order.
     *
     * The server assigns pos_reference in _complete_values_from_session when
     * the order record is created, so it only exists after the order has been
     * synced; that is why bar tickets are printed from afterOrderValidation
     * (see utils/order_payment_validation.js). It stays empty when the order
     * was validated offline, and then the line is simply omitted rather than
     * showing a different number that would not match the sale.
     */
    get orderReference() {
        return this.props.order.pos_reference || "";
    }

    get dateStr() {
        return DateTime.now().toFormat("dd/MM/yyyy HH:mm");
    }
}
