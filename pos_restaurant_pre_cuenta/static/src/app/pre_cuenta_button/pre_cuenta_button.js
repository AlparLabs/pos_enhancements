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

        // ── Pass 1: accumulate raw numeric values per product name ──────────────
        // Key: productName   Value: { qty (number), priceTotal (number), unit, customerNote, isComboGroup }
        const groupMap = new Map();

        for (const line of order.getSortedOrderlines()) {
            // Skip combo children — folded into the parent row.
            if (line.combo_parent_id) {
                continue;
            }

            let productName, numQty, numPrice, unit, customerNote, isComboGroup;

            if (line.combo_line_ids && line.combo_line_ids.length > 0) {
                // ── Combo parent: collapse the entire combo tree ──
                const allLines = line.getAllLinesInCombo();
                numPrice = allLines.reduce((sum, l) => sum + (l.price_subtotal_incl || 0), 0);
                productName = line.get_full_product_name();
                numQty = line.get_quantity();
                unit = line.product_id.uom_id ? line.product_id.uom_id.name : "";
                customerNote = line.get_customer_note() || "";
                isComboGroup = true;
            } else {
                // ── Regular line ──
                numPrice = line.price_subtotal_incl || 0;
                productName = line.get_full_product_name();
                numQty = line.get_quantity();
                unit = line.product_id.uom_id ? line.product_id.uom_id.name : "";
                customerNote = line.get_customer_note() || "";
                isComboGroup = false;
            }

            // Merge into the map: same productName → add qty and price.
            if (groupMap.has(productName)) {
                const entry = groupMap.get(productName);
                entry.numQty += numQty;
                entry.numPrice += numPrice;
                // Append distinct customer notes
                if (customerNote && !entry.customerNote.includes(customerNote)) {
                    entry.customerNote = entry.customerNote
                        ? `${entry.customerNote}; ${customerNote}`
                        : customerNote;
                }
            } else {
                groupMap.set(productName, {
                    productName, numQty, numPrice, unit, customerNote, isComboGroup,
                });
            }
        }

        // ── Pass 2: format and return as display rows ────────────────────────────
        return [...groupMap.values()].map((entry) => ({
            productName: entry.productName,
            // Format qty: show as integer when whole, or with up to 3 decimals
            qty: entry.numQty % 1 === 0
                ? entry.numQty.toFixed(0)
                : parseFloat(entry.numQty.toFixed(3)).toString(),
            unit: entry.unit,
            price: fmt(entry.numPrice),
            customerNote: entry.customerNote,
            isComboGroup: entry.isComboGroup,
        }));
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

        // ── Mark the table as "Pre-Cuenta printed" ───────────────────────────────
        // pre_cuenta_printed is declared by pos_restaurant_table_status.
        // The optional-chaining check makes this a no-op when that module is absent,
        // so pos_restaurant_pre_cuenta can be used standalone without it.
        if ('pre_cuenta_printed' in order) {
            order.update({ pre_cuenta_printed: true });
            if (typeof order.id === "number") {
                this.pos.addPendingOrder([order.id]);
            }
        }
        // ─────────────────────────────────────────────────────────────────────────
    }
}

// Inject into ControlButtons so the XML template can reference it
Object.assign(ControlButtons.components, { PreCuentaButton });
