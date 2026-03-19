/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * @override
     * Groups identical products in the kitchen receipt (Order Change Receipt).
     * This prevents multiple lines like "+1 Coca-Cola" when adding multiple combos
     * that contain the same product.
     */
    get_changes() {
        const changes = super.get_changes(...arguments);
        
        if (changes.new && Object.keys(changes.new).length > 0) {
            changes.new = this._groupKitchenChanges(changes.new);
        }
        
        if (changes.cancelled && Object.keys(changes.cancelled).length > 0) {
            changes.cancelled = this._groupKitchenChanges(changes.cancelled);
        }
        
        return changes;
    },

    /**
     * Helper to group change objects by product name and notes.
     * @param {Object} changes - The changes object from get_changes().
     * @returns {Object} Grouped changes.
     */
    _groupKitchenChanges(changes) {
        const grouped = {};
        
        for (const [uuid, lineData] of Object.entries(changes)) {
            // Identify lines that should be grouped together.
            // We group by product name, internal note, customer note, and course_id.
            // We include internalNote/customerNote because items with different 
            // instructions should remain separate for the kitchen.
            const orderline = this.models["pos.order.line"].getBy("uuid", uuid);
            const key = JSON.stringify({
                productName: lineData.name,
                internalNote: lineData.internalNote || "",
                customerNote: lineData.customerNote || "",
                course_id: orderline?.course_id?.uuid || "",
            });

            if (grouped[key]) {
                grouped[key].quantity += lineData.quantity;
            } else {
                // Clone the first line of the group and use it as the base.
                // We keep the first UUID encountered as the key for the resulting object.
                grouped[key] = { ...lineData, course_id: orderline?.course_id };
                // We also store the original UUID to maintain Odoo's expected structure
                // where keys are line-related identifiers, although any unique key
                // would likely work for the template.
                grouped[key]._original_uuid = uuid;
            }
        }

        // Re-map grouped results back to an object indexed by some identifier.
        // We use the first UUID of each group as the key.
        const result = {};
        for (const [key, data] of Object.entries(grouped)) {
            result[data._original_uuid] = data;
            delete data._original_uuid;
        }

        return result;
    }
});
