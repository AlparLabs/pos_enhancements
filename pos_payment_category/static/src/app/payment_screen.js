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
        
        // Save the original config methods for filtering
        this.original_payment_methods = [...this.payment_methods_from_config];
        
        // Initialize the view with categories
        this.updateDisplayedMethods();
    },

    get paymentCategories() {
        return this.pos.models['pos.payment.category'] ? this.pos.models['pos.payment.category'].getAll() : [];
    },

    updateDisplayedMethods() {
        let items = [];
        
        // If a category is selected, ONLY show methods belonging to that category
        if (this.state.activePaymentCategory) {
            items = this.original_payment_methods.filter(
                (method) => method.category_id && method.category_id[0] === this.state.activePaymentCategory.id
            );
        } else {
            // Include top-level categories
            const categories = this.paymentCategories.map(cat => ({
                ...cat,
                is_category: true, // Marker for the XML template
            }));
            
            // Include methods that don't belong to any category
            const looseMethods = this.original_payment_methods.filter((method) => !method.category_id);
            
            items = [...categories, ...looseMethods];
        }

        // Overwrite the property used by Odoo 18's PaymentScreen XML loop
        this.payment_methods_from_config = items;
    },

    clickPaymentCategory(category) {
        // Toggle the category selection on and off
        if (this.state.activePaymentCategory && this.state.activePaymentCategory.id === category.id) {
            this.state.activePaymentCategory = null;
        } else {
            this.state.activePaymentCategory = category;
        }
        
        // Re-compute the property so Odoo re-renders the list
        this.updateDisplayedMethods();
    },
});
