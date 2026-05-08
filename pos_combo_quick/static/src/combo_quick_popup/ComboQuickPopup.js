/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Dialog } from "@web/core/dialog/dialog";

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

        // qty[comboId][itemId]  = total units selected for that item
        // attrs[comboId][itemId] = ARRAY — one {lineId: valueId} object per unit
        //   e.g. if 3x Pizza selected: attrs[c][pizza] = [{size: 0}, {size: large}, {size: small}]
        const initialQty = {};
        const initialAttrs = {};

        for (const combo of this.props.comboGroups) {
            initialQty[combo.id] = {};
            initialAttrs[combo.id] = {};
            for (const item of combo.combo_item_ids) {
                initialQty[combo.id][item.id] = 0;
                initialAttrs[combo.id][item.id] = []; // grows/shrinks with qty
            }
        }

        this.state = useState({
            totalQty: 0,
            qty: initialQty,
            attrs: initialAttrs,
        });
    }

    // ─── Total quantity selector ───────────────────────────────────────────────

    setTotalQty(n) {
        this.state.totalQty = n;
        for (const combo of this.props.comboGroups) {
            for (const item of combo.combo_item_ids) {
                this.state.qty[combo.id][item.id] = 0;
                this.state.attrs[combo.id][item.id] = [];
            }
        }
    }

    // ─── Per-item quantity controls ───────────────────────────────────────────

    getGroupTotal(comboId) {
        return Object.values(this.state.qty[comboId] || {}).reduce((s, q) => s + q, 0);
    }

    canIncrement(comboId) {
        return (
            this.state.totalQty > 0 &&
            this.getGroupTotal(comboId) < this.state.totalQty
        );
    }

    increment(comboId, itemId) {
        if (!this.canIncrement(comboId)) return;
        this.state.qty[comboId][itemId]++;
        // Push a new empty attr-selection object for this new unit
        const combo = this.props.comboGroups.find((c) => c.id === comboId);
        const item = combo?.combo_item_ids.find((i) => i.id === itemId);
        const newUnitAttrs = {};
        for (const line of (item?.attribute_lines || [])) {
            newUnitAttrs[line.id] = 0;
        }
        this.state.attrs[comboId][itemId].push(newUnitAttrs);
    }

    decrement(comboId, itemId) {
        if (this.state.qty[comboId][itemId] > 0) {
            this.state.qty[comboId][itemId]--;
            this.state.attrs[comboId][itemId].pop(); // remove last unit's selections
        }
    }

    // ─── Attribute selection ──────────────────────────────────────────────────

    /**
     * Set the selected attribute value for a specific unit of a specific item.
     * @param {number} comboId
     * @param {number} itemId
     * @param {number} unitIndex  - 0-based index within this item's selected units
     * @param {number} lineId     - attribute line id
     * @param {number} valueId    - selected product.template.attribute.value id
     */
    selectAttr(comboId, itemId, unitIndex, lineId, valueId) {
        this.state.attrs[comboId][itemId][unitIndex][lineId] = valueId;
    }

    /**
     * True if all attribute lines for ONE specific unit are filled.
     */
    isUnitAttrComplete(unitAttrs) {
        return Object.keys(unitAttrs).length === 0 || Object.values(unitAttrs).every((v) => v > 0);
    }

    /**
     * True if every unit of an item has all its attributes selected.
     */
    isItemAttrComplete(comboId, itemId) {
        const units = this.state.attrs[comboId]?.[itemId] || [];
        return units.every((unitAttrs) => this.isUnitAttrComplete(unitAttrs));
    }

    // ─── Validation ───────────────────────────────────────────────────────────

    isGroupComplete(comboId) {
        return (
            this.state.totalQty > 0 &&
            this.getGroupTotal(comboId) === this.state.totalQty
        );
    }

    /** Qty filled AND all selected units have all their attrs set. */
    isGroupFullyComplete(comboId) {
        if (!this.isGroupComplete(comboId)) return false;
        const combo = this.props.comboGroups.find((c) => c.id === comboId);
        return (combo?.combo_item_ids || []).every((item) => {
            if (this.state.qty[comboId][item.id] === 0) return true;
            return this.isItemAttrComplete(comboId, item.id);
        });
    }

    /** True when every combo group has its quantity slots filled (attrs optional). */
    get allGroupsComplete() {
        if (this.state.totalQty === 0) return false;
        return this.props.comboGroups.every((combo) => this.isGroupComplete(combo.id));
    }

    /** True when every combo group has qty filled AND all selected attrs chosen. */
    get allGroupsAttrComplete() {
        if (this.state.totalQty === 0) return false;
        return this.props.comboGroups.every((combo) => this.isGroupFullyComplete(combo.id));
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

    // ─── Instance resolution ──────────────────────────────────────────────────

    /**
     * Given instance index i, returns { itemId, unitIndex } for a combo group.
     * Items are "consumed" sequentially: all units of item A first, then item B, etc.
     *
     * Example: qty = { pizza: 3, pasta: 2 }, totalQty = 5
     *   i=0 → pizza, unit 0
     *   i=1 → pizza, unit 1
     *   i=2 → pizza, unit 2
     *   i=3 → pasta, unit 0
     *   i=4 → pasta, unit 1
     */
    _resolveInstanceSlot(comboId, instanceIndex) {
        const groupQty = this.state.qty[comboId];
        let counter = 0;
        for (const [itemId, qty] of Object.entries(groupQty)) {
            if (instanceIndex < counter + qty) {
                return { itemId: parseInt(itemId), unitIndex: instanceIndex - counter };
            }
            counter += qty;
        }
        return { itemId: parseInt(Object.keys(groupQty)[0]), unitIndex: 0 };
    }

    // ─── Confirm ──────────────────────────────────────────────────────────────

    confirm() {
        if (!this.allGroupsComplete) return; // qty must be filled; attrs are optional

        const instances = [];
        for (let i = 0; i < this.state.totalQty; i++) {
            const instanceConf = this.props.comboGroups.map((combo) => {
                const { itemId: chosenItemId, unitIndex } = this._resolveInstanceSlot(combo.id, i);
                const item = combo.combo_item_ids.find((ci) => ci.id === chosenItemId);
                // Get this specific unit's attribute selections
                const unitAttrs = this.state.attrs[combo.id][chosenItemId][unitIndex] || {};
                const attribute_value_ids = Object.values(unitAttrs).filter((v) => v > 0);
                return {
                    combo_item_id: item._record,
                    configuration: {
                        attribute_value_ids,
                        attribute_custom_values: {},
                    },
                };
            });
            instances.push(instanceConf);
        }

        this.props.getPayload(instances);
        this.props.close();
    }
}
