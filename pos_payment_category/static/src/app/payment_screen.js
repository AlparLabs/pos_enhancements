/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        // Use a dedicated state object — Odoo 19's PaymentScreen does not expose
        // a this.state, so we cannot add to it. A separate reactive object avoids
        // any collision with the parent's internal state management.
        this.categoryState = useState({ activePaymentCategory: null });
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
        const allMethods = this.payment_methods_from_config;

        if (this.categoryState.activePaymentCategory) {
            // Only show methods belonging to the selected category
            return allMethods.filter(
                (m) => m.category_id && m.category_id.id === this.categoryState.activePaymentCategory.original_id
            );
        }

        // Top-level view: categories as folder objects + uncategorized methods
        const cats = this.paymentCategories.map((cat) => ({
            id: `category_${cat.id}`,
            original_id: cat.id,
            name: cat.name,
            is_category: true,
        }));
        const loose = allMethods.filter((m) => !m.category_id);
        return [...cats, ...loose];
    },

    /**
     * @param {Object} category
     */
    clickPaymentCategory(category) {
        // Toggle the category selection on and off
        if (this.categoryState.activePaymentCategory?.id === category.id) {
            this.categoryState.activePaymentCategory = null;
        } else {
            this.categoryState.activePaymentCategory = category;
        }
    },

    /**
     * Guard addNewPaymentLine against being called with a category object or undefined
     * @param {Object} paymentMethod
     * @returns {Promise<any>}
     */
    async addNewPaymentLine(paymentMethod) {
        if (!paymentMethod || paymentMethod.is_category) return;
        return super.addNewPaymentLine(...arguments);
    },
});
