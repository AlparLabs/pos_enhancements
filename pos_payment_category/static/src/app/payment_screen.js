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

    get displayedPaymentMethods() {
        // We provide a new getter for the UI to loop over instead of the static core list
        const allMethods = this.payment_methods_from_config;
        
        // If a category is selected, ONLY show methods belonging to that category
        if (this.state.activePaymentCategory) {
            return allMethods.filter(
                (method) => method.category_id && method.category_id.id === this.state.activePaymentCategory.id
            );
        }

        // If NO category is selected, show only methods that DO NOT have a category assigned
        return allMethods.filter((method) => !method.category_id);
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
