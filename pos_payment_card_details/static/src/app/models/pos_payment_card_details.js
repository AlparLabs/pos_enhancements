/** @odoo-module **/

import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { patch } from "@web/core/utils/patch";

patch(PosPayment.prototype, {
    setup(vals) {
        super.setup(...arguments);
        // Initialize card detail fields from loaded data or defaults.
        // In Odoo 18, the Base model loads field values from `vals` that come
        // from the backend via _load_pos_data_fields. We only need to set
        // defaults for fields not yet present.
        if (this.lot_number === undefined) {
            this.lot_number = vals.lot_number || "";
        }
        if (this.coupon_number === undefined) {
            this.coupon_number = vals.coupon_number || "";
        }
        if (this.installments === undefined) {
            this.installments = vals.installments || 1;
        }
    },

    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        result.lot_number = this.lot_number;
        result.coupon_number = this.coupon_number;
        result.installments = this.installments;
        return result;
    },
});
