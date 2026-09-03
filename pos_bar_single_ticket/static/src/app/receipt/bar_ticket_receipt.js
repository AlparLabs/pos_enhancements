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
     * One to three characters configured on the POS (pos.config.bar_ticket_watermark),
     * printed as an outlined watermark on the four corners. Empty disables it.
     */
    get watermark() {
        const order = this.props.order;
        const config = order.config_id || order.config;
        return (config?.bar_ticket_watermark || "").trim();
    }

    /**
     * Type metrics for the watermark, sized to the margin the POS name leaves.
     *
     * The name prints centred, so the room in the corners is whatever it does
     * not use. Measured on the venues that actually issue bar tickets: "Bosco
     * Sunset CAJA 1" leaves 87px per side and "Sunset- Caja Central" 94px, so
     * 79px are usable once the 8px inset is taken off. These sizes measure
     * 50/53/57px, keeping 20 to 29px of air with the longest of those names.
     *
     * `height` matches the type size instead of using a fixed box: the text
     * hangs from the top of its SVG, so an oversized box pushes the bottom pair
     * up into the receipt-number line. With a tight box they sit in the blank
     * tail left by the two trailing <br/>.
     */
    get watermarkMetrics() {
        const fontSize = { 1: 52, 2: 36, 3: 28 }[this.watermark.length] || 28;
        return {
            fontSize,
            height: Math.round(fontSize * 1.05),
            y: Math.round(fontSize * 0.86),
            strokeWidth: Math.max(1.2, Math.round(fontSize * 0.042 * 10) / 10),
        };
    }

    /**
     * Positioning context for the watermark. Nothing else is added: the corners
     * live in the margin beside the existing content, so the ticket keeps the
     * exact length it has without a watermark.
     */
    get receiptStyle() {
        return this.watermark ? "position: relative;" : "";
    }

    get dateStr() {
        return DateTime.now().toFormat("dd/MM/yyyy HH:mm");
    }
}
