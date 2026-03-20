/* @odoo-module */

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { getNow, parseServerDatetime, diffHours } from "./utils/time_utils";

patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {

        if (this.pos.config.enable_table_timer && this.currentOrder.start_time) {

            const start = parseServerDatetime(this.currentOrder.start_time);
            const end = getNow();
            const duration = diffHours(start, end);

            this.currentOrder.update({
                duration: duration,
            });
        }

        await super.validateOrder(...arguments);
    },
});
