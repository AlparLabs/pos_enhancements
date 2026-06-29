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
        // becomes undefined while the screen briefly re-renders. Returning []
        // avoids the native template dereferencing a missing order.
        if (!this.currentOrder) {
            return [];
        }

        const allMethods = this.configPaymentMethods || [];
        const availableCategories = this.paymentCategories;

        // No categories configured for this POS → behave like the module is off.
        if (!availableCategories.length) {
            return allMethods;
        }

        const active = this.categoryState.activePaymentCategory;
        if (active) {
            return allMethods.filter(
                (m) => m.category_id && m.category_id.id === active.original_id
            );
        }

        // Top level: virtual folder objects for each category + loose methods.
        const folders = availableCategories.map((cat) => ({
            id: `category_${cat.id}`,
            original_id: cat.id,
            name: cat.name,
            is_category: true,
        }));
        const loose = allMethods.filter((m) => !m.category_id);
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
