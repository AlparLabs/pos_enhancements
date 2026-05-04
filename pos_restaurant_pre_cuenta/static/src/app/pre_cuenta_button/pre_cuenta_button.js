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

    /**
     * Only show this button when inside a restaurant table session.
     */
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

        // Build the standard POS header data (includes table, customer_count, cashier)
        const headerData = this.pos.getReceiptHeaderData(order);

        // ── Waiter injection (optional) ──────────────────────────────────────────
        // order.waiter_id only exists when pos_restaurant_waiter is installed.
        // If not installed, waiter_id is undefined → condition is false → no crash.
        if (order.waiter_id) {
            headerData.waiter_name = order.waiter_id.name;
        }
        // ─────────────────────────────────────────────────────────────────────────

        const exportData = order.export_for_printing(
            this.pos.session._base_url,
            headerData
        );

        const receiptData = {
            // Flatten header fields (table, customer_count, cashier, company…)
            ...headerData,
            // Flatten export fields (orderlines, amount_total, partner, name…)
            ...exportData,
            // Explicitly pin company from the POS store — prevents exportData
            // from overwriting it if export_for_printing returns its own company key.
            company: this.pos.company,
            // Pre-built logo URL so the template doesn't need to access company.id
            company_logo_url: `/web/image?model=res.company&id=${this.pos.company.id}&field=logo`,
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

// Inject into ControlButtons so the XML template can reference it
Object.assign(ControlButtons.components, { PreCuentaButton });
