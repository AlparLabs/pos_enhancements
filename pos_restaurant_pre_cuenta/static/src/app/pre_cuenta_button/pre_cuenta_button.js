/** @odoo-module **/

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { PreCuentaReceipt } from "@pos_restaurant_pre_cuenta/app/receipt/pre_cuenta_receipt";

export class PreCuentaButton extends Component {
    static template = "pos_restaurant_pre_cuenta.PreCuentaButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.printer = useService("printer");
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get isVisible() {
        return (
            this.pos.config.module_pos_restaurant &&
            Boolean(this.currentOrder?.table_id)
        );
    }

    async click() {
        const order = this.currentOrder;
        if (!order || order.get_orderlines().length === 0) {
            return;
        }

        const headerData = this.pos.getReceiptHeaderData(order);

        if (order.waiter_id) {
            headerData.waiter_name = order.waiter_id.name;
        }

        const exportData = order.export_for_printing(
            this.pos.session._base_url,
            headerData
        );

        if (headerData.company?.id && this.pos.company?.logo) {
            headerData.company = {
                ...headerData.company,
                logoDataUrl: `data:image/png;base64,${this.pos.company.logo}`,
            };
        }

        const receiptData = {
            ...exportData,
            headerData: headerData,
        };

        await this.printer.print(
            PreCuentaReceipt,
            {
                data: receiptData,
                formatCurrency: this.env.utils.formatCurrency,
            },
            { webPrintFallback: true }
        );
    }
}

Object.assign(ControlButtons.components, { PreCuentaButton });
