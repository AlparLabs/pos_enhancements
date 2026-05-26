/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        // If this payment method has an interest margin, we add the surcharge line first
        if (paymentMethod.interest_margin_pct > 0 && paymentMethod.interest_product_id) {
            const order = this.currentOrder;
            // Get the current amount due before surcharge
            const due = order.get_due();
            
            if (due > 0) {
                const interest_amount = due * (paymentMethod.interest_margin_pct / 100.0);
                
                // Add the interest product line
                const product = this.pos.db.get_product_by_id(paymentMethod.interest_product_id[0]);
                if (product) {
                    await order.add_product(product, {
                        price: interest_amount,
                        quantity: 1,
                        merge: false,
                        description: `Recargo por medio de pago: ${paymentMethod.name} (${paymentMethod.interest_margin_pct}%)`,
                    });
                }
            }
        }
        
        // Call the original method which handles adding the payment line with the updated due amount
        return super.addNewPaymentLine(...arguments);
    },

    deletePaymentLine(event) {
        const { cid } = event.detail || event;
        const line = this.paymentLines.find((pl) => pl.cid === cid);
        
        if (line && line.payment_method.interest_margin_pct > 0 && line.payment_method.interest_product_id) {
            // Find and remove the surcharge product line added by this payment method
            const productId = line.payment_method.interest_product_id[0];
            const order = this.currentOrder;
            const surchargeLine = order.getOrderlines().find(
                (ol) => ol.product.id === productId && ol.price === (line.amount * (line.payment_method.interest_margin_pct / 100.0))
            );
            
            // To be safer, we can just remove all lines with this specific product
            const linesToRemove = order.getOrderlines().filter((ol) => ol.product.id === productId);
            for (const ol of linesToRemove) {
                order.remove_orderline(ol);
            }
        }
        
        return super.deletePaymentLine(...arguments);
    }
});
