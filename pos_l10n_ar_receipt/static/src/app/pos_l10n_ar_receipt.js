/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

// Patch PaymentScreen to wait for the invoice data
patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        // Call the original method which handles the API calls to validate and push the order.
        await super.validateOrder(...arguments);

        const order = this.currentOrder;
        
        // If the order exists, has a name/reference and was asked to be invoiced
        if (order && order.is_to_invoice() && order.name) {
            try {
                // Fetch real-time AFIP data the moment the invoice is successfully created.
                // orm.call is accessible via this.env.services.orm or this.pos.data.orm in older builds,
                // but in Odoo 18 it's typically this.pos.data.orm or this.env.services.orm.
                const orm = this.env.services.orm;
                const data = await orm.call("pos.order", "get_l10n_ar_receipt_data", [order.name]);
                
                if (data) {
                    order.l10n_ar_data = data;
                }
            } catch (e) {
                console.warn("Could not fetch real-time AFIP receipt data:", e);
            }
        }
    }
});

// Patch PosOrder to inject the AFIP data into the printing properties
patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(...arguments);
        
        if (this.l10n_ar_data) {
            Object.assign(result, this.l10n_ar_data);
        }
        
        return result;
    }
});
