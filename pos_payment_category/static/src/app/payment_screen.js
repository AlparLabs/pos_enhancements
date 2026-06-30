/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";

const PCLOG = "[pos_payment_category]";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.categoryState = useState({ activePaymentCategory: null });
        // The native list of payment methods, populated by super.setup() into
        // this.payment_methods_from_config. Captured here so our filtered getter
        // can read it without depending on a configPaymentMethods getter (which
        // does not exist in Odoo 19.0).
        this._pcNativeMethods = this.payment_methods_from_config;
        console.log(PCLOG, "setup() ran — patch is loaded", {
            payment_methods_from_config_len: this.payment_methods_from_config?.length,
        });
    },

    /**
     * Resolve a payment method's category id.
     *
     * Source of truth is the record's raw many2one value (the stored category
     * id), which is always present regardless of whether the relation getter
     * resolves to a record. Falls back to the resolved relation record.
     * Tolerates id / [id, name] / record-object representations.
     * @param {Object} method
     * @returns {number|false}
     */
    _pcCategoryId(method) {
        let raw = method.raw?.category_id;
        if (Array.isArray(raw)) {
            raw = raw[0];
        }
        if (raw && typeof raw === 'object') {
            raw = raw.id;
        }
        if (raw) {
            return raw;
        }
        const cat = method.category_id;
        if (!cat) {
            return false;
        }
        return typeof cat === 'object' ? cat.id : cat;
    },

    /**
     * @returns {Array<Object>}
     */
    get paymentCategories() {
        const cats = this.pos.models['pos.payment.category']?.getAll() ?? [];
        console.log(PCLOG, "paymentCategories getter →", cats.length, cats);
        return cats;
    },

    /**
     * The list the template iterates over (via xpath on the methods loop).
     * Returns either the category folders + uncategorized methods (top level),
     * or the methods of the open category.
     * @returns {Array<Object>}
     */
    get filteredPaymentMethods() {
        console.log(PCLOG, "filteredPaymentMethods getter CALLED", {
            hasCurrentOrder: !!this.currentOrder,
        });

        // During POS teardown the active order is deleted and this.currentOrder
        // becomes undefined while the screen briefly re-renders. Returning []
        // avoids the native template dereferencing a missing order.
        if (!this.currentOrder) {
            console.log(PCLOG, "→ no currentOrder, returning []");
            return [];
        }

        // Odoo 19.0 has no configPaymentMethods getter; the native setup stores
        // the sorted methods in this.payment_methods_from_config. Read from there
        // (fall back to the raw config list) — NOT from a getter that may not exist.
        const allMethods =
            this._pcNativeMethods ?? this.pos.config.payment_method_ids ?? [];
        const availableCategories = this.paymentCategories;
        console.log(PCLOG, "allMethods:", allMethods.length, "categories:", availableCategories.length);

        // No categories configured for this POS → behave like the module is off.
        if (!availableCategories.length) {
            console.log(PCLOG, "→ no categories, returning all", allMethods.length, "methods", allMethods);
            return allMethods;
        }

        const active = this.categoryState.activePaymentCategory;
        if (active) {
            const filtered = allMethods.filter(
                (m) => this._pcCategoryId(m) === active.original_id
            );
            console.log(PCLOG, "→ inside category", active.name,
                "active.original_id =", active.original_id,
                "methods:", allMethods.map((m) => ({
                    name: m.name,
                    raw_category_id: m.raw?.category_id,
                    getter_category_id: m.category_id,
                    resolved: this._pcCategoryId(m),
                })),
                "→ filtered:", filtered.length);
            return filtered;
        }

        // Top level: virtual folder objects for each category + loose methods.
        const folders = availableCategories.map((cat) => ({
            id: `category_${cat.id}`,
            original_id: cat.id,
            name: cat.name,
            is_category: true,
        }));
        const loose = allMethods.filter((m) => !this._pcCategoryId(m));
        console.log(PCLOG, "→ top level:", folders.length, "folders +", loose.length, "loose methods");
        return [...folders, ...loose];
    },

    /**
     * @param {Object} category - a virtual folder object (is_category: true)
     */
    clickPaymentCategory(category) {
        if (this.categoryState.activePaymentCategory?.id === category.id) {
            this.categoryState.activePaymentCategory = null;
        } else {
            this.categoryState.activePaymentCategory = category;
        }
    },

    /**
     * Guard: never try to add a payment line for a category folder object.
     * @param {Object} paymentMethod
     * @returns {Promise<any>}
     */
    async addNewPaymentLine(paymentMethod) {
        if (!paymentMethod || paymentMethod.is_category) return;
        return super.addNewPaymentLine(...arguments);
    },
});
