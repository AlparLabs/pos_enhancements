/** @odoo-module **/

import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";

patch(OrderReceipt.prototype, {
    get deliveryCustomer() {
        return (
            this.props.order?.delivery_customer ||
            this.props.data?.delivery_customer ||
            null
        );
    },
});
