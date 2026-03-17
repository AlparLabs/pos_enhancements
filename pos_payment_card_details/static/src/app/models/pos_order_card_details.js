/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    export_for_printing() {
        const receipt = super.export_for_printing(...arguments);

        // Ensure our card detail fields are passed to the receipt's payment lines.
        // In Odoo 18, paymentlines are populated from payment_ids.map(p => p.export_for_printing()),
        // so by patching export_for_printing on PosPayment those fields already flow through.
        // This override is kept as a safety net for any reprinting path that may rebuild paymentlines separately.
        if (receipt.paymentlines && this.payment_ids) {
            for (let i = 0; i < receipt.paymentlines.length; i++) {
                const line = this.payment_ids[i];
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
