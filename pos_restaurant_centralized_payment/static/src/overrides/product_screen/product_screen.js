/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PreCuentaReceipt } from "@pos_restaurant_pre_cuenta/app/receipt/pre_cuenta_receipt";

patch(ProductScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.printer = useService("printer");
    },

    get canPay() {
        if (!this.pos.config.restrict_payment_to_manager) {
            return true;
        }
        if (!this.pos.config.module_pos_hr) {
            return true;
        }
        return this.pos.get_cashier()?._role === "manager";
    },

    async clickSendToRegister() {
        const order = this.pos.get_order();
        if (!order || order.get_orderlines().length === 0) {
            return;
        }

        const headerData = this.pos.getReceiptHeaderData(order);
        if (order.waiter_id) {
            headerData.waiter_name = order.waiter_id.name;
        }
        if (this.pos.company?.logo) {
            headerData.company = {
                ...headerData.company,
                logoDataUrl: `data:image/png;base64,${this.pos.company.logo}`,
            };
        }

        const receiptData = {
            ...order.export_for_printing(this.pos.session._base_url, headerData),
            headerData,
        };

        await this.printer.print(
            PreCuentaReceipt,
            { data: receiptData, formatCurrency: this.env.utils.formatCurrency },
            { webPrintFallback: true }
        );

        this.pos.showScreen("FloorScreen");
    },
});
