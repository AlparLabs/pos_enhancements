/** @odoo-module **/

import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { patch } from "@web/core/utils/patch";

patch(PosPayment.prototype, {
    setup(vals) {
        super.setup(...arguments);
        // Initialize card detail fields from loaded data or defaults
        this.lot_number = vals.lot_number || "";
        this.coupon_number = vals.coupon_number || "";
        this.installments = vals.installments || 1;
    },

    serialize() {
        // In Odoo 18, models use serialize() to send data to the backend
        // Fallback to export_as_JSON if serialize is somehow not present
        const json = typeof super.serialize === "function" ? super.serialize(...arguments) : super.export_as_JSON(...arguments);
        json.lot_number = this.lot_number;
        json.coupon_number = this.coupon_number;
        json.installments = this.installments;
        return json;
    },

    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.lot_number = this.lot_number;
        json.coupon_number = this.coupon_number;
        json.installments = this.installments;
        return json;
    },

    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        result.lot_number = this.lot_number;
        result.coupon_number = this.coupon_number;
        result.installments = this.installments;
        return result;
    },
});
