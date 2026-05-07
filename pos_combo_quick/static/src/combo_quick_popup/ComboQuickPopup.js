/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * ComboQuickPopup
 *
 * Allows the cashier to:
 *  1. Select the total number of menus (totalQty).
 *  2. Distribute choices for each combo group (e.g., Mains, Beverages)
 *     across those menus using +/- buttons.
 *
 * On confirm, builds a payload consumed by product_screen_patch.js which
 * uses computeComboItems() + addLineToCurrentOrder() to create the order lines.
 *
 * Props:
 *   - productTemplate  {Object}   The combo product (product.product record)
 *   - comboGroups      {Array}    [{ id, name, qty_free, qty_max, combo_item_ids: [{id, name, extra_price, _record}] }]
 *   - getPayload       {Function} Called with the final payload on confirm
 *   - close            {Function} Injected by dialog service
 */
export class ComboQuickPopup extends Component {
    static template = "pos_combo_quick.ComboQuickPopup";
    static components = { Dialog };
    static props = {
        productTemplate: Object,
        comboGroups: Array,
        getPayload: Function,
        close: Function,
    };

    setup() {
        this.pos = usePos();

        // qty[comboId][itemId] = selected quantity for that item
        const initialQty = {};
        for (const combo of this.props.comboGroups) {
            initialQty[combo.id] = {};
            for (const item of combo.combo_item_ids) {
                initialQty[combo.id][item.id] = 0;
            }
        }

        this.state = useState({
            totalQty: 0,
            qty: initialQty,
        });
    }

    // ─── Total menu quantity selector ─────────────────────────────────────────

    setTotalQty(n) {
        this.state.totalQty = n;
        // Reset all selections whenever total quantity changes
        for (const combo of this.props.comboGroups) {
            for (const item of combo.combo_item_ids) {
                this.state.qty[combo.id][item.id] = 0;
            }
        }
    }

    // ─── Per-item quantity controls ───────────────────────────────────────────

    /**
     * Sum of all selected quantities within a combo group.
     */
    getGroupTotal(comboId) {
        return Object.values(this.state.qty[comboId] || {}).reduce((s, q) => s + q, 0);
    }

    /**
     * Returns true if we can still add one more of this item to this group.
     * Capped at totalQty (each group slot fills the same pool of N menus).
     */
    canIncrement(comboId) {
        return (
            this.state.totalQty > 0 &&
            this.getGroupTotal(comboId) < this.state.totalQty
        );
    }

    increment(comboId, itemId) {
        if (!this.canIncrement(comboId)) return;
        this.state.qty[comboId][itemId]++;
    }

    decrement(comboId, itemId) {
        if (this.state.qty[comboId][itemId] > 0) {
            this.state.qty[comboId][itemId]--;
        }
    }

    // ─── Validation ───────────────────────────────────────────────────────────

    isGroupComplete(comboId) {
        return (
            this.state.totalQty > 0 &&
            this.getGroupTotal(comboId) === this.state.totalQty
        );
    }

    get allGroupsComplete() {
        if (this.state.totalQty === 0) return false;
        return this.props.comboGroups.every((combo) => this.isGroupComplete(combo.id));
    }

    get progressPercent() {
        if (this.state.totalQty === 0) return 0;
        const totalSelected = this.props.comboGroups.reduce(
            (sum, combo) => sum + this.getGroupTotal(combo.id),
            0
        );
        const maxTotal = this.props.comboGroups.length * this.state.totalQty;
        return Math.round((totalSelected / maxTotal) * 100);
    }

    // ─── Instance resolution (sequential distribution) ────────────────────────

    /**
     * Given instance index i (0-based), determines which item was assigned
     * to this instance for a given combo group.
     *
     * Example: qty = { Milanesa: 3, Spaghetti: 1, Salmon: 1 }, totalQty=5
     *   i=0,1,2 → Milanesa  (ids from entries 0..2)
     *   i=3     → Spaghetti
     *   i=4     → Salmon
     */
    _resolveItemForInstance(comboId, instanceIndex) {
        const groupQty = this.state.qty[comboId];
        let counter = 0;
        for (const [itemId, qty] of Object.entries(groupQty)) {
            counter += qty;
            if (instanceIndex < counter) {
                return parseInt(itemId);
            }
        }
        // Fallback (should never happen when allGroupsComplete)
        return parseInt(Object.keys(groupQty)[0]);
    }

    // ─── Confirm ──────────────────────────────────────────────────────────────

    /**
     * Builds one payload-per-instance, then calls getPayload with the full array.
     * The patch will group identical instance payloads into a single order line.
     *
     * Each element of the returned array = one menu instance:
     *   [ { combo_item_id: <record>, configuration: {...}, qty: 1 }, ... ]
     */
    confirm() {
        if (!this.allGroupsComplete) return;

        const instances = [];
        for (let i = 0; i < this.state.totalQty; i++) {
            const instanceConf = this.props.comboGroups.map((combo) => {
                const chosenItemId = this._resolveItemForInstance(combo.id, i);
                const item = combo.combo_item_ids.find((ci) => ci.id === chosenItemId);
                return {
                    combo_item_id: item._record,
                    configuration: {
                        attribute_value_ids: [],
                        attribute_custom_values: {},
                    },
                    qty: 1,
                };
            });
            instances.push(instanceConf);
        }

        this.props.getPayload(instances);
        this.props.close();
    }
}
