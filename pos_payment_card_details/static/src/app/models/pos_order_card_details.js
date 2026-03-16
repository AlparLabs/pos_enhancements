/** @odoo-module **/

import { Order } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";

patch(Order.prototype, {
    export_for_printing() {
        const receipt = super.export_for_printing(...arguments);
        
        // Ensure our new fields are passed to the receipt paymentlines
        if (receipt.paymentlines && this.paymentlines) {
            for (let i = 0; i < receipt.paymentlines.length; i++) {
                const line = this.paymentlines[i];
                const receiptLine = receipt.paymentlines[i];
                if (line && receiptLine) {
                    receiptLine.lot_number = line.lot_number;
                    receiptLine.coupon_number = line.coupon_number;
                    receiptLine.installments = line.installments;
                }
            }
        }
        return receipt;
    }
});
