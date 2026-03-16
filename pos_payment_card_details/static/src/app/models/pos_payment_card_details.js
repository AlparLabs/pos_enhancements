/** @odoo-module **/

import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { patch } from "@web/core/utils/patch";

patch(PosPayment.prototype, {
    setup() {
        super.setup(...arguments);
        this.lot_number = this.lot_number || "";
        this.coupon_number = this.coupon_number || "";
        this.installments = this.installments || 1;
    },

    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.lot_number = this.lot_number;
        json.coupon_number = this.coupon_number;
        json.installments = this.installments;
        return json;
    },
});
