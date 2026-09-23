/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";
import { formatCustomerDeliveryDetails } from "@pos_delivery_customer_details/app/utils/delivery_customer";

patch(PosOrder.prototype, {
    /**
     * @override
     * Expose customer delivery details to printed order receipt
     */
    export_for_printing(baseUrl, headerData) {
        const data = super.export_for_printing(...arguments);
        if (this.config?.pos_delivery_customer_details && this.partner_id) {
            data.delivery_customer = formatCustomerDeliveryDetails(
                this.partner_id,
                this.models
            );
        }
        return data;
    },
});
