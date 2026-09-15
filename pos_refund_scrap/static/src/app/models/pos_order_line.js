/** @odoo-module **/

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

patch(PosOrderline.prototype, {
    setup(vals) {
        super.setup(vals);
        if (vals && "is_scrap_refund" in vals) {
            this.is_scrap_refund = Boolean(vals.is_scrap_refund);
        } else if (this.qty < 0 && this.refunded_orderline_id) {
            this.is_scrap_refund = this._computeIsScrapRefund();
        } else {
            this.is_scrap_refund = false;
        }
    },

    _computeIsScrapRefund() {
        const config = this.pos?.config;
        if (!config || !config.refund_to_scrap) {
            return false;
        }
        if (config.refund_scrap_mode === "all") {
            return true;
        }
        // Mode 'category'
        const product = this.product_id;
        if (!product) {
            return false;
        }
        const categs = product.pos_categ_ids || [];
        return categs.some((c) => Boolean(c.scrap_on_refund));
    },

    setQuantity(quantity, keep_price) {
        super.setQuantity(...arguments);
        if (this.qty < 0 && this.refunded_orderline_id && this.is_scrap_refund === undefined) {
            this.is_scrap_refund = this._computeIsScrapRefund();
        }
    },
});
