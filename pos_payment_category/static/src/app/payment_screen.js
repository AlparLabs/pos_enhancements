/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.categoryState = useState({ activePaymentCategory: null });
    },

    /**
     * The full list of payment methods for this POS. Odoo 19.0 stores it in
     * this.payment_methods_from_config (populated by the native setup from
     * pos.config.payment_method_ids); there is NO configPaymentMethods getter
     * in 19.0. Fall back to the raw config list just in case.
     * @returns {Array<Object>}
     */
    get _pcAllMethods() {
        const native = this.payment_methods_from_config;
        if (native && native.length) {
            return native;
        }
        return this.pos.config.payment_method_ids ?? [];
    },

    /**
     * Resolve a payment method's category id from the record's raw many2one
     * value (the stored id, always present), tolerating id / [id, name] /
     * record-object representations. Falls back to the resolved relation.
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
        return this.pos.models['pos.payment.category']?.getAll() ?? [];
    },

    /**
     * The list the template iterates over (via xpath on the methods loop).
     * Returns either the category folders + uncategorized methods (top level),
     * or the methods of the open category.
     * @returns {Array<Object>}
     */
    get filteredPaymentMethods() {
        // During POS teardown the active order is deleted and this.currentOrder
        // becomes undefined while the screen briefly re-renders.
        if (!this.currentOrder) {
            return [];
        }

        const allMethods = this._pcAllMethods;
        const availableCategories = this.paymentCategories;

        // No categories configured for this POS → behave like the module is off.
        if (!availableCategories.length) {
            return allMethods;
        }

        const active = this.categoryState.activePaymentCategory;
        if (active) {
            return allMethods.filter(
                (m) => this._pcCategoryId(m) === active.original_id
            );
        }

        // Top level: virtual folder objects for each category + loose methods.
        const folders = availableCategories.map((cat) => ({
            id: `category_${cat.id}`,
            original_id: cat.id,
            name: cat.name,
            is_category: true,
        }));
        const loose = allMethods.filter((m) => !this._pcCategoryId(m));
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
