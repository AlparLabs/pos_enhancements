/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { formatCustomerDeliveryDetails } from "@pos_delivery_customer_details/app/utils/delivery_customer";

patch(PosOrder.prototype, {
    /**
     * Reactive getter to access delivery customer details on order instance
     */
    get delivery_customer() {
        if (!this.config?.pos_delivery_customer_details || !this.partner_id) {
            return null;
        }
        return formatCustomerDeliveryDetails(this.partner_id, this.models);
    },
});
