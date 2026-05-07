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

    /**
     * Build a grouped list of display rows for the pre-cuenta receipt.
     *
     * - Combo parent lines (combo_line_ids.length > 0) are collapsed into ONE
     *   row: the parent product name, its quantity, and the combined price
     *   (sum of price_subtotal_incl for the parent + every child line).
     * - Combo child lines are skipped — they are folded into the parent row.
     * - Regular (non-combo) lines pass through unchanged via getDisplayData().
     *
     * @param {PosOrder} order  live order model instance
     * @returns {Array<{productName, qty, unit, price, customerNote, isComboGroup}>}
     */
    buildGroupedOrderlines(order) {
        const fmt = this.env.utils.formatCurrency;
        const rows = [];

        for (const line of order.getSortedOrderlines()) {
            // Skip children — they are already folded into the parent row.
            if (line.combo_parent_id) {
                continue;
            }

            if (line.combo_line_ids && line.combo_line_ids.length > 0) {
                // ── Combo parent: collapse all lines (parent + children) ──
                // Sum price_subtotal_incl (tax-included line total) across
                // the entire combo tree.
                const allLines = line.getAllLinesInCombo();
                const comboTotal = allLines.reduce(
                    (sum, l) => sum + (l.price_subtotal_incl || 0),
                    0
                );

                rows.push({
                    productName: line.get_full_product_name(),
                    qty: line.get_quantity_str(),
                    unit: line.product_id.uom_id ? line.product_id.uom_id.name : "",
                    price: fmt(comboTotal),
                    customerNote: line.get_customer_note() || "",
                    isComboGroup: true,
                });
            } else {
                // ── Regular (non-combo) line ──
                const d = line.getDisplayData();
                rows.push({
                    productName: d.productName,
                    qty: d.qty,
                    unit: d.unit,
                    price: d.price,
                    customerNote: d.customerNote,
                    isComboGroup: false,
                });
            }
        }

        return rows;
    }

    async click() {
        const order = this.currentOrder;
        if (!order || order.get_orderlines().length === 0) {
            return;
        }

        // Build the standard POS header data (includes table, customer_count, cashier, company…)
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

        // Keep headerData as a nested sub-object — same pattern as pos_retail_pre_ticket.
        // A flat spread (...headerData, ...exportData) can cause key collisions where
        // exportData.company overwrites headerData.company, breaking the logo and contact info.
        const receiptData = {
            ...exportData,
            headerData: headerData,
            // Grouped list: combos are collapsed into a single row each.
            groupedOrderlines: this.buildGroupedOrderlines(order),
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
