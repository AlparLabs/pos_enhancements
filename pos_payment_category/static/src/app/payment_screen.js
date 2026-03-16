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
        return this.pos.models['pos.payment.category'] ? this.pos.models['pos.payment.category'].getAll() : [];
    },

    get payment_methods_from_config() {
        // We provide a single unified array for the UI to loop over instead of the static core list
        // This prevents breaking the Odoo flexbox layout
        const allMethods = super.payment_methods_from_config;
        if (!allMethods) {
            return [];
        }
        
        let items = [];
        
        // If a category is selected, ONLY show methods belonging to that category
        if (this.state.activePaymentCategory) {
            items = allMethods.filter(
                (method) => method.category_id && method.category_id[0] === this.state.activePaymentCategory.id
            );
        } else {
            // Include top-level categories
            const categories = this.paymentCategories.map(cat => ({
                ...cat,
                is_category: true, // Marker for the XML template
            }));
            
            // Include methods that don't belong to any category
            const looseMethods = allMethods.filter((method) => !method.category_id);
            
            items = [...categories, ...looseMethods];
        }

        return items;
    },

    clickPaymentCategory(category) {
        // Toggle the category selection on and off
        if (this.state.activePaymentCategory && this.state.activePaymentCategory.id === category.id) {
            this.state.activePaymentCategory = null;
        } else {
            this.state.activePaymentCategory = category;
        }
    },
});
