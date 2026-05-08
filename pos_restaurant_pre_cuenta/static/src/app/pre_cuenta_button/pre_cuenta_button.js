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

        // Build the standard POS header data (includes table, customer_count, cashier, company…)
        const headerData = this.pos.getReceiptHeaderData(order);

        // ── Waiter injection (optional) ──────────────────────────────────────────
        if (order.waiter_id) {
            headerData.waiter_name = order.waiter_id.name;
        }
        // ─────────────────────────────────────────────────────────────────────────

        const exportData = order.export_for_printing(
            this.pos.session._base_url,
            headerData
        );

        // ── Logo preload ──────────────────────────────────────────────────────────
        // To prevent the thermal printer from cutting early due to slow image loads,
        // we inject the base64 logo that Odoo already pre-loaded into memory during
        // POS startup. This is 100% instantaneous, offline-safe, and uses 0 network.
        if (headerData.company?.id && this.pos.company_logo_base64) {
            headerData.company = {
                ...headerData.company,
                logoDataUrl: this.pos.company_logo_base64,
            };
        }
        // ─────────────────────────────────────────────────────────────────────────

        // Keep headerData as a nested sub-object to avoid collisions
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

// Inject into ControlButtons so the XML template can reference it
Object.assign(ControlButtons.components, { PreCuentaButton });
