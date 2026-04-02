/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { PosOrder } from "@point_of_sale/app/models/pos_order";

/**
 * Patch PaymentScreen.afterOrderValidation.
 *
 * In Odoo 18 the printing + screen navigation happens INSIDE afterOrderValidation,
 * NOT after validateOrder returns. The full call chain is:
 *
 *   validateOrder()
 *     └─ _finalizeValidation()
 *          ├─ syncAllOrders()          ← order sent to server, invoice created here
 *          └─ afterOrderValidation()   ← printReceipt() + showScreen() happen here
 *
 * The original patch attached the fetched data AFTER `await super.validateOrder()`,
 * but by that point Odoo had already called printReceipt() and navigated away.
 *
 * By patching afterOrderValidation instead, we can:
 *   1. Await the AFIP data fetch (the invoice already exists at this point because
 *      syncAllOrders() has already run inside _finalizeValidation())
 *   2. Store the data on the order instance as `order.l10n_ar_data`
 *   3. THEN let the original afterOrderValidation run — when it calls printReceipt()
 *      → orderExportForPrinting() → order.export_for_printing(), our second patch
 *      will merge l10n_ar_data into the receipt data object.
 */
patch(PaymentScreen.prototype, {
    async afterOrderValidation(hasOrderChange) {
        const order = this.currentOrder;

        // Only fetch AFIP data when the order is being invoiced.
        // Use pos_reference (the DB field) not order.name (which is the display
        // label "Order XXXX"). The Python method searches by pos_reference.
        if (order && order.is_to_invoice() && order.pos_reference) {
            try {
                const orm = this.env.services.orm;
                const data = await orm.call(
                    "pos.order",
                    "get_l10n_ar_receipt_data",
                    [order.pos_reference]
                );

                if (data) {
                    // Store on the order instance so export_for_printing can pick it up.
                    order.l10n_ar_data = data;
                }
            } catch (e) {
                console.warn("Could not fetch real-time AFIP receipt data:", e);
            }
        }

        // Now let the original method run — it will call printReceipt() which
        // triggers export_for_printing(), which our patch below will enrich.
        return await super.afterOrderValidation(hasOrderChange);
    },
});

/**
 * Patch PosOrder.export_for_printing to merge in Argentine AFIP data.
 *
 * This is called by PosStore.orderExportForPrinting() → PosStore.printReceipt()
 * and also by the ReceiptScreen when rendering the on-screen receipt preview.
 *
 * The `l10n_ar_data` property is set by the PaymentScreen patch above before
 * printReceipt() is invoked, so by the time this runs the data is present.
 */
patch(PosOrder.prototype, {
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(...arguments);

        if (this.l10n_ar_data) {
            Object.assign(result, this.l10n_ar_data);
        }

        return result;
    },
});
