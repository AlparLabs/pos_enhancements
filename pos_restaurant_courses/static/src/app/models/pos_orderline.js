/** @odoo-module **/

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";

patch(PosOrderline.prototype, {
    setup() {
        super.setup(...arguments);
    },
    canBeMergedWith(orderline) {
        if (this.course_id) {
            if (this.course_id.uuid !== orderline.course_id?.uuid) {
                return false;
            }
        } else if (orderline.course_id?.uuid) {
            return false;
        }
        return super.canBeMergedWith(orderline);
    },
});
