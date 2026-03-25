/** @odoo-module **/

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

patch(PosOrderline.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        this.bar_ticket_printed = this.bar_ticket_printed || false;
    },
    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.bar_ticket_printed = json.bar_ticket_printed || false;
    },
    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.bar_ticket_printed = this.bar_ticket_printed;
        return json;
    }
});
