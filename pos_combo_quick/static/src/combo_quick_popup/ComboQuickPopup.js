/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * @typedef {Object} ComboAttrValue
 * @property {number} id
 * @property {string} name
 * @property {number} price_extra
 */

/**
 * @typedef {Object} ComboAttrLine
 * @property {number} id
 * @property {string} name
 * @property {ComboAttrValue[]} values
 */

/**
 * @typedef {Object} ComboItem
 * @property {number} id
 * @property {string} name
 * @property {number} extra_price
 * @property {Object} _record
 * @property {ComboAttrLine[]} attribute_lines
 */

/**
 * @typedef {Object} ComboGroup
 * @property {number} id
 * @property {string} name
 * @property {ComboItem[]} combo_item_ids
 */

/**
 * @typedef {Object} ComboQuickPopupProps
 * @property {Object} productTemplate
 * @property {ComboGroup[]} comboGroups
 * @property {Function} getPayload
 * @property {Function} close
 */

/**
 * @typedef {Object} ComboQuickPopupState
 * @property {number} totalQty
 * @property {Object.<number, Object.<number, number>>} qty
 * @property {Object.<number, Object.<number, Array<Object.<number, number>>>>} attrs
 */

export class ComboQuickPopup extends Component {
    static template = "pos_combo_quick.ComboQuickPopup";
    static components = { Dialog };

    /** @type {ComboQuickPopupProps} */
    static props = {
        productTemplate: { type: Object },
        comboGroups: { type: Array },
        getPayload: { type: Function },
        close: { type: Function },
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

        /** @type {ComboQuickPopupState} */
        this.state = useState({
            totalQty: 0,
            qty: initialQty,
            attrs: initialAttrs,
        });
    }

    // ─── Total quantity selector ───────────────────────────────────────────────

    /**
     * @param {number} n
     */
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

    /**
     * @param {number} comboId
     * @returns {number}
     */
    getGroupTotal(comboId) {
        return Object.values(this.state.qty[comboId] || {}).reduce((s, q) => s + q, 0);
    }

    /**
     * @param {number} comboId
     * @returns {boolean}
     */
    canIncrement(comboId) {
        return (
            this.state.totalQty > 0 &&
            this.getGroupTotal(comboId) < this.state.totalQty
        );
    }

    /**
     * @param {number} comboId
     * @param {number} itemId
     */
    increment(comboId, itemId) {
        if (!this.canIncrement(comboId)) return;
        this.state.qty[comboId][itemId]++;
        const combo = this.props.comboGroups.find((c) => c.id === comboId);
        const item = combo?.combo_item_ids.find((i) => i.id === itemId);
        const newUnitAttrs = {};
        for (const line of (item?.attribute_lines || [])) {
            newUnitAttrs[line.id] = 0;
        }
        this.state.attrs[comboId][itemId].push(newUnitAttrs);
    }

    /**
     * @param {number} comboId
     * @param {number} itemId
     */
    decrement(comboId, itemId) {
        if (this.state.qty[comboId][itemId] > 0) {
            this.state.qty[comboId][itemId]--;
            this.state.attrs[comboId][itemId].pop();
        }
    }

    // ─── Attribute selection ──────────────────────────────────────────────────

    /**
     * @param {number} comboId
     * @param {number} itemId
     * @param {number} unitIndex
     * @param {number} lineId
     * @param {number} valueId
     */
    selectAttr(comboId, itemId, unitIndex, lineId, valueId) {
        this.state.attrs[comboId][itemId][unitIndex][lineId] = valueId;
    }

    /**
     * @param {Object.<number, number>} unitAttrs
     * @returns {boolean}
     */
    isUnitAttrComplete(unitAttrs) {
        return Object.keys(unitAttrs).length === 0 || Object.values(unitAttrs).every((v) => v > 0);
    }

    /**
     * @param {number} comboId
     * @param {number} itemId
     * @returns {boolean}
     */
    isItemAttrComplete(comboId, itemId) {
        const units = this.state.attrs[comboId]?.[itemId] || [];
        return units.every((unitAttrs) => this.isUnitAttrComplete(unitAttrs));
    }

    // ─── Validation ───────────────────────────────────────────────────────────

    /**
     * @param {number} comboId
     * @returns {boolean}
     */
    isGroupComplete(comboId) {
        return (
            this.state.totalQty > 0 &&
            this.getGroupTotal(comboId) === this.state.totalQty
        );
    }

    /**
     * @param {number} comboId
     * @returns {boolean}
     */
    isGroupFullyComplete(comboId) {
        if (!this.isGroupComplete(comboId)) return false;
        const combo = this.props.comboGroups.find((c) => c.id === comboId);
        return (combo?.combo_item_ids || []).every((item) => {
            if (this.state.qty[comboId][item.id] === 0) return true;
            return this.isItemAttrComplete(comboId, item.id);
        });
    }

    /** @returns {boolean} */
    get allGroupsComplete() {
        if (this.state.totalQty === 0) return false;
        return this.props.comboGroups.every((combo) => this.isGroupComplete(combo.id));
    }

    /** @returns {boolean} */
    get allGroupsAttrComplete() {
        if (this.state.totalQty === 0) return false;
        return this.props.comboGroups.every((combo) => this.isGroupFullyComplete(combo.id));
    }

    /** @returns {number} */
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
     * @param {number} comboId
     * @param {number} instanceIndex
     * @returns {{ itemId: number, unitIndex: number }}
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
        if (!this.allGroupsComplete) return;

        const instances = [];
        for (let i = 0; i < this.state.totalQty; i++) {
            const instanceConf = this.props.comboGroups.map((combo) => {
                const { itemId: chosenItemId, unitIndex } = this._resolveInstanceSlot(combo.id, i);
                const item = combo.combo_item_ids.find((ci) => ci.id === chosenItemId);
                const unitAttrs = this.state.attrs[combo.id][chosenItemId][unitIndex] || {};
                const attribute_value_ids = Object.values(unitAttrs).filter((v) => v > 0);
                return {
                    combo_item_id: item._record,
                    qty: 1,
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
