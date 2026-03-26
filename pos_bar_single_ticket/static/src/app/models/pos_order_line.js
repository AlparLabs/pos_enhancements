/** @odoo-module **/

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

/**
 * Adds `bar_ticket_paid_and_printed` to each order line.
 *
 * This flag is set to true ONLY when the order is validated (payment confirmed).
 * It is never reset by deleting/re-adding a product, because it lives on the
 * line object that is serialized and persisted across the session.
 *
 * The flag also drives the supervisor reprint button: if true, the order has
 * already been printed at least once and a supervisor PIN is required.
 */
patch(PosOrderline.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.bar_ticket_paid_and_printed = this.bar_ticket_paid_and_printed || false;
    },
    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.bar_ticket_paid_and_printed = json.bar_ticket_paid_and_printed || false;
    },
    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.bar_ticket_paid_and_printed = this.bar_ticket_paid_and_printed;
        return json;
    },
});
