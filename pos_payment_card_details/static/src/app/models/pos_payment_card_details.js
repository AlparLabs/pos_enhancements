/** @odoo-module **/

import { PosPayment } from "@point_of_sale/app/models/pos_payment";
import { patch } from "@web/core/utils/patch";

patch(PosPayment.prototype, {
    /**
     * @returns {Object}
     */
    serialize() {
        const result = super.serialize ? super.serialize(...arguments) : {};
        result.lot_number = this.lot_number || "";
        result.coupon_number = this.coupon_number || "";
        result.installments = this.installments || 1;
        return result;
    },
    /**
     * @returns {Object}
     */
    export_as_JSON() {
        const json = super.export_as_JSON ? super.export_as_JSON(...arguments) : {};
        json.lot_number = this.lot_number || "";
        json.coupon_number = this.coupon_number || "";
        json.installments = this.installments || 1;
        return json;
    },
    /**
     * @returns {Object}
     */
    export_for_printing() {
        const result = super.export_for_printing(...arguments);
        result.lot_number = this.lot_number || "";
        result.coupon_number = this.coupon_number || "";
        result.installments = this.installments || 1;
        return result;
    },
});

