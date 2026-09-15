/** @odoo-module **/

import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { patch } from "@web/core/utils/patch";

patch(Orderline.prototype, {
    toggleScrapRefund(ev) {
        ev.stopPropagation();
        this.line.is_scrap_refund = !this.line.is_scrap_refund;
    },
});
