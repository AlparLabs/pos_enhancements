/** @odoo-module **/

import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { patch } from "@web/core/utils/patch";

patch(PosPayment.prototype, {
    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        result.lot_number = this.lot_number || "";
        result.coupon_number = this.coupon_number || "";
        result.installments = this.installments || 1;
        return result;
    },
});

