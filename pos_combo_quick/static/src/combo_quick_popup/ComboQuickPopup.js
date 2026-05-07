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

        // qty[comboId][itemId] = selected quantity for that item
        const initialQty = {};
        // attrs[comboId][itemId][lineId] = selected attribute value id (0 = unset)
        const initialAttrs = {};

        for (const combo of this.props.comboGroups) {
            initialQty[combo.id] = {};
            initialAttrs[combo.id] = {};
            for (const item of combo.combo_item_ids) {
                initialQty[combo.id][item.id] = 0;
                initialAttrs[combo.id][item.id] = {};
                for (const line of (item.attribute_lines || [])) {
                    initialAttrs[combo.id][item.id][line.id] = 0;
                }
            }
        }

        this.state = useState({
            totalQty: 0,
            qty: initialQty,
            attrs: initialAttrs,
        });
    }

    // ─── Total menu quantity selector ─────────────────────────────────────────

    setTotalQty(n) {
        this.state.totalQty = n;
        // Reset all qty and attr selections
        for (const combo of this.props.comboGroups) {
            for (const item of combo.combo_item_ids) {
                this.state.qty[combo.id][item.id] = 0;
                for (const line of (item.attribute_lines || [])) {
                    this.state.attrs[combo.id][item.id][line.id] = 0;
                }
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
    }

    decrement(comboId, itemId) {
        if (this.state.qty[comboId][itemId] > 0) {
            this.state.qty[comboId][itemId]--;
            // Reset attr selections when item is deselected
            if (this.state.qty[comboId][itemId] === 0) {
                const combo = this.props.comboGroups.find((c) => c.id === comboId);
                const item = combo?.combo_item_ids.find((i) => i.id === itemId);
                for (const line of (item?.attribute_lines || [])) {
                    this.state.attrs[comboId][itemId][line.id] = 0;
                }
            }
        }
    }

    // ─── Attribute selection ──────────────────────────────────────────────────

    selectAttr(comboId, itemId, lineId, valueId) {
        this.state.attrs[comboId][itemId][lineId] = valueId;
    }

    /**
     * True if this item has no attr lines, or all attr lines have a value selected.
     */
    isItemAttrComplete(comboId, itemId) {
        const attrState = this.state.attrs[comboId]?.[itemId] || {};
        return Object.values(attrState).every((v) => v > 0);
    }

    // ─── Validation ───────────────────────────────────────────────────────────

    isGroupComplete(comboId) {
        return (
            this.state.totalQty > 0 &&
            this.getGroupTotal(comboId) === this.state.totalQty
        );
    }

    /**
     * Group is fully done: qty filled AND all selected items have all attrs set.
     */
    isGroupFullyComplete(comboId) {
        if (!this.isGroupComplete(comboId)) return false;
        const combo = this.props.comboGroups.find((c) => c.id === comboId);
        return (combo?.combo_item_ids || []).every((item) => {
            if (this.state.qty[comboId][item.id] === 0) return true;
            return this.isItemAttrComplete(comboId, item.id);
        });
    }

    get allGroupsComplete() {
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

    // ─── Instance resolution (sequential distribution) ────────────────────────

    _resolveItemForInstance(comboId, instanceIndex) {
        const groupQty = this.state.qty[comboId];
        let counter = 0;
        for (const [itemId, qty] of Object.entries(groupQty)) {
            counter += qty;
            if (instanceIndex < counter) {
                return parseInt(itemId);
            }
        }
        return parseInt(Object.keys(groupQty)[0]);
    }

    // ─── Confirm ──────────────────────────────────────────────────────────────

    confirm() {
        if (!this.allGroupsComplete) return;

        const instances = [];
        for (let i = 0; i < this.state.totalQty; i++) {
            const instanceConf = this.props.comboGroups.map((combo) => {
                const chosenItemId = this._resolveItemForInstance(combo.id, i);
                const item = combo.combo_item_ids.find((ci) => ci.id === chosenItemId);
                // Collect selected attribute value ids for this item
                const attrState = this.state.attrs[combo.id][chosenItemId] || {};
                const attribute_value_ids = Object.values(attrState).filter((v) => v > 0);
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
