/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.categoryState = useState({ activePaymentCategory: null });
        // Replace the static array assigned by super.setup() with a reactive getter.
        // This way the native template's "this.payment_methods_from_config" resolves
        // to our filtered list without any fragile t-foreach xpath patching.
        delete this.payment_methods_from_config;
        Object.defineProperty(this, 'payment_methods_from_config', {
            get: () => this.filteredPaymentMethods,
            configurable: true,
        });
    },

    /**
     * @returns {Array<Object>}
     */
    get paymentCategories() {
        return this.pos.models['pos.payment.category']?.getAll() ?? [];
    },

    /**
     * @returns {Array<Object>}
     */
    get filteredPaymentMethods() {
        // During POS teardown (e.g. closing the session) the order is deleted
        // and this.currentOrder becomes undefined while the screen briefly
        // re-renders. Returning [] keeps the native t-foreach from calling
        // getPaymentMethodFmtAmount(pm, undefined), which would crash.
        if (!this.currentOrder) {
            return [];
        }

        const allMethods = this.configPaymentMethods || [];
        const availableCategories = this.paymentCategories;

        // If no categories are configured for this POS, show all methods normally
        // so the module degrades gracefully when not fully configured.
        if (!availableCategories.length) {
            return allMethods;
        }

        if (this.categoryState.activePaymentCategory) {
            return allMethods.filter(
                (m) => m.category_id && m.category_id.id === this.categoryState.activePaymentCategory.original_id
            );
        }

        // Top-level: virtual category folder objects + uncategorized methods
        const cats = availableCategories.map((cat) => ({
            id: `category_${cat.id}`,
            original_id: cat.id,
            name: cat.name,
            is_category: true,
        }));
        const loose = allMethods.filter((m) => !m.category_id);
        return [...cats, ...loose];
    },

    /**
     * Hide virtual category objects from the native paymentmethod div.
     * @param {Object} paymentMethod
     * @returns {boolean}
     */
    showPaymentMethod(paymentMethod) {
        if (paymentMethod.is_category) return false;
        return super.showPaymentMethod(paymentMethod);
    },

    /**
     * @param {Object} category
     */
    clickPaymentCategory(category) {
        if (this.categoryState.activePaymentCategory?.id === category.id) {
            this.categoryState.activePaymentCategory = null;
        } else {
            this.categoryState.activePaymentCategory = category;
        }
    },

    /**
     * @param {Object} paymentMethod
     * @returns {Promise<any>}
     */
    async addNewPaymentLine(paymentMethod) {
        if (!paymentMethod || paymentMethod.is_category) return;
        return super.addNewPaymentLine(...arguments);
    },
});
