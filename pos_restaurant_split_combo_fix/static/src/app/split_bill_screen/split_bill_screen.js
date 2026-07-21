/** @odoo-module **/

import { SplitBillScreen } from "@pos_restaurant/app/split_bill_screen/split_bill_screen";
import { patch } from "@web/core/utils/patch";

/**
 * Combo-safe override of SplitBillScreen.createSplittedOrder (Odoo 18).
 *
 * The core method (addons/pos_restaurant/static/src/app/split_bill_screen/
 * split_bill_screen.js) serializes every selected line and re-creates it on
 * the new order with `create(vals, false /*ignoreRelations*/, true /*fromSerialized*/)`.
 *
 * `line.serialize()` (orm=false) keeps `combo_parent_id` / `combo_line_ids`,
 * whose values are the *original* order's line ids. With `fromSerialized=true`
 * the related-models layer connects the freshly created lines to those existing
 * records, cross-wiring the two orders' combo trees:
 *   - new child lines get attached to the ORIGINAL combo parent, and
 *   - the new combo parent steals the ORIGINAL children (many2one inverse),
 * leaving the original order's children orphaned -> they render as stray
 * standalone lines and later crash getComboTotalPrice() with
 * "Cannot read properties of undefined (reading 'config')".
 *
 * This override reproduces the core method verbatim EXCEPT:
 *   1. it deletes the combo relational fields from the serialized data before
 *      creating each new line (so nothing is cross-connected), and
 *   2. after all new lines exist, it rebuilds combo_parent_id on the new lines
 *      using an original-uuid -> new-line map, keeping the link inside the new
 *      order only. The original order's combo is never touched.
 *
 * NOTE: this mirrors core logic and must be re-checked against
 * SplitBillScreen.createSplittedOrder on every Odoo point-of-sale upgrade.
 */
patch(SplitBillScreen.prototype, {
    async createSplittedOrder() {
        const curOrderUuid = this.currentOrder.uuid;
        const originalOrder = this.pos.models["pos.order"].find((o) => o.uuid === curOrderUuid);
        this.pos.selectedTable = null;
        const originalOrderName = this._getOrderName(originalOrder);
        const newOrderName = this._getSplitOrderName(originalOrderName);

        const newOrder = this.pos.createNewOrder();
        newOrder.floating_order_name = newOrderName;
        newOrder.uiState.splittedOrderUuid = curOrderUuid;
        await this.preSplitOrder(originalOrder, newOrder);

        // Create lines for the new order
        const lineToDel = [];
        // FIX: map original line uuid -> newly created line, used below to
        // rebuild combo parent/child links within the new order.
        const newLineByOrigUuid = {};
        for (const line of originalOrder.lines) {
            if (this.qtyTracker[line.uuid]) {
                const data = line.serialize();
                delete data.uuid;
                // FIX: drop combo relations pointing at the original order's
                // lines so `create(..., fromSerialized=true)` cannot cross-wire
                // the two orders' combo trees. Rebuilt after the loop.
                delete data.combo_parent_id;
                delete data.combo_line_ids;
                const newLine = this.pos.models["pos.order.line"].create(
                    {
                        ...data,
                        qty: this.qtyTracker[line.uuid],
                        order_id: newOrder.id,
                    },
                    false,
                    true
                );
                // FIX: remember the mapping for the combo re-link pass.
                newLineByOrigUuid[line.uuid] = newLine;

                const ordered =
                    originalOrder.last_order_preparation_change.lines[line.preparationKey];
                if (line.get_quantity() === this.qtyTracker[line.uuid]) {
                    delete originalOrder.last_order_preparation_change.lines[line.preparationKey];
                    lineToDel.push(line);

                    if (ordered) {
                        const newOrdered = { ...ordered };
                        newOrdered.uuid = newLine.uuid;
                        newOrder.last_order_preparation_change.lines[newLine.preparationKey] =
                            newOrdered;
                    }
                } else {
                    const newQty = line.get_quantity() - this.qtyTracker[line.uuid];
                    line.update({ qty: newQty });

                    if (ordered) {
                        const orderedQty = ordered["quantity"];
                        const newOrderedQty = orderedQty > newQty ? newQty : orderedQty;
                        ordered["quantity"] = newOrderedQty;

                        if (orderedQty > newQty) {
                            const newOrdered = { ...ordered };

                            newOrdered.uuid = newLine.uuid;
                            newOrdered.quantity = orderedQty - newQty;
                            newOrder.last_order_preparation_change.lines[newLine.preparationKey] =
                                newOrdered;
                        }
                    }
                }
            }
        }

        // FIX: rebuild combo parent/child links inside the new order. Setting a
        // child's combo_parent_id also populates the parent's combo_line_ids via
        // the many2one inverse, mirroring how a normally-added combo is wired.
        for (const line of originalOrder.lines) {
            const newLine = newLineByOrigUuid[line.uuid];
            if (newLine && line.combo_parent_id) {
                const newParent = newLineByOrigUuid[line.combo_parent_id.uuid];
                if (newParent) {
                    newLine.update({ combo_parent_id: newParent });
                }
            }
        }

        for (const line of lineToDel) {
            line.delete();
        }

        await this.pos.syncAllOrders({ orders: [originalOrder, newOrder] });
        originalOrder.customer_count -= 1;
        await this.postSplitOrder(originalOrder, newOrder);
        originalOrder.set_screen_data({ name: "ProductScreen" });
        this.pos.selectedOrderUuid = null;
        this.pos.set_order(newOrder);
        this.back();
    },
});
