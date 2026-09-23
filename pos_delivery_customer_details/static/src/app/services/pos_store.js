/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import { formatCustomerDeliveryDetails } from "@pos_delivery_customer_details/app/utils/delivery_customer";

patch(PosStore.prototype, {
    /**
     * @override
     * Expose customer delivery details to kitchen preparation data
     */
    getOrderData(order, reprint) {
        const data = super.getOrderData(...arguments);
        if (order?.partner_id && this.config?.pos_delivery_customer_details !== false) {
            data.delivery_customer = formatCustomerDeliveryDetails(
                order.partner_id,
                this.models
            );
        }
        return data;
    },
});
