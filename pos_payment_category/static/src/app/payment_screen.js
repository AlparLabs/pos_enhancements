/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup(...arguments);
        // Track the actively clicked payment category inside the component's state
        this.state = useState({
            ...this.state,
            activePaymentCategory: null,
        });
    },

    get paymentCategories() {
        return this.pos.models['pos.payment.category']?.getAll() ?? [];
    },

    get filteredPaymentMethods() {
        const allMethods = this.payment_methods_from_config;

        if (this.state.activePaymentCategory) {
            // Only show methods belonging to the selected category
            return allMethods.filter(
                (m) => m.category_id && m.category_id.id === this.state.activePaymentCategory.original_id
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

    clickPaymentCategory(category) {
        // Toggle the category selection on and off
        if (this.state.activePaymentCategory?.id === category.id) {
            this.state.activePaymentCategory = null;
        } else {
            this.state.activePaymentCategory = category;
        }
    },

    // Guard addNewPaymentLine against being called with a category object
    async addNewPaymentLine(paymentMethod) {
        if (paymentMethod.is_category) return;
        return super.addNewPaymentLine(...arguments);
    },
});
