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

    /**
     * Up to five characters configured on the POS (pos.config.bar_ticket_watermark),
     * printed as an outlined watermark on the four corners. Empty disables it.
     */
    get watermark() {
        const order = this.props.order;
        const config = order.config_id || order.config;
        return (config?.bar_ticket_watermark || "").trim();
    }

    /**
     * Type metrics for the watermark, shrunk as characters are added.
     *
     * `band` is the vertical room reserved for it at the top and bottom of the
     * receipt. The watermark cannot simply sit in the corners next to the
     * content: the POS name is centred and its width is whatever the venue is
     * called — "LA MARCHIGIANA Centro" is 370px of the 512px the receipt prints,
     * leaving 71px per side, which not even a single 72px glyph fits into. So
     * the corners get their own bands, above the name and below the receipt
     * number, where nothing else is laid out and any length is safe.
     */
    get watermarkMetrics() {
        const fontSize = { 1: 56, 2: 56, 3: 48, 4: 40, 5: 34 }[this.watermark.length] || 34;
        return {
            fontSize,
            band: fontSize + 16,
            y: Math.round(fontSize * 0.86),
            strokeWidth: Math.max(1.2, Math.round(fontSize * 0.042 * 10) / 10),
        };
    }

    /**
     * The receipt is the positioning context for the watermark, and reserves the
     * bands it needs. Without a watermark nothing is added, so the ticket keeps
     * the exact length it had before the feature existed.
     */
    get receiptStyle() {
        if (!this.watermark) {
            return "";
        }
        const { band } = this.watermarkMetrics;
        return `position: relative; padding-top: ${band}px; padding-bottom: ${band}px;`;
    }

    get dateStr() {
        return DateTime.now().toFormat("dd/MM/yyyy HH:mm");
    }
}
