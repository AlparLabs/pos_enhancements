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
     * Helper to group change objects by product name and notes and sort by Category.
     * @param {Array|Object} changes - The changes object from get_changes().
     * @returns {Array|Object} Grouped and sorted changes.
     */
    _groupKitchenChanges(changes) {
        const isArray = Array.isArray(changes);
        const iterableChanges = isArray ? changes : Object.values(changes);
        
        const grouped = {};
        
        for (const lineData of iterableChanges) {
            // Identify lines that should be grouped together.
            // If lineData has `uuid` or `id`, use it. Otherwise try to match by name.
            const uuidMatch = lineData.uuid || lineData.id || lineData.line_uuid;
            let orderline = null;
            if (uuidMatch) {
                // In Odoo 18 models are usually indexed by uuid or id
                orderline = this.models["pos.order.line"].getBy("uuid", uuidMatch) || this.models["pos.order.line"].getBy("id", uuidMatch);
            }
            if (!orderline) {
                orderline = this.lines.find((l) => l.get_product().display_name === lineData.name || l.get_full_product_name() === lineData.name);
            }

            const course_uuid = orderline?.course_id?.uuid || "";
            const category = orderline?.product_id?.pos_categ_ids?.[0];
            const categorySequence = category?.sequence || 999;
            const categoryName = category?.name || "Z";

            const key = JSON.stringify({
                productName: lineData.name,
                internalNote: lineData.internalNote || "",
                customerNote: lineData.customerNote || "",
                course_uuid: course_uuid,
            });

            if (grouped[key]) {
                grouped[key].quantity += lineData.quantity;
            } else {
                grouped[key] = { 
                    ...lineData, 
                    course_id: orderline?.course_id,
                    pos_category_sequence: categorySequence,
                    pos_category_name: categoryName
                };
            }
        }

        let result = Object.values(grouped);
        
        // Sort by Category Sequence, then Category Name, then Product Name
        result.sort((a, b) => {
            if (a.pos_category_sequence !== b.pos_category_sequence) {
                return a.pos_category_sequence - b.pos_category_sequence;
            }
            if (a.pos_category_name !== b.pos_category_name) {
                return a.pos_category_name.localeCompare(b.pos_category_name);
            }
            return a.name.localeCompare(b.name);
        });

        // Return the same type as input (Odoo 18 get_changes usually uses Arrays)
        if (isArray) {
            return result;
        } else {
            const objResult = {};
            // Using the original line's uuid or id as key if needed, or simply string index.
            result.forEach((item, index) => {
                const uuid = item.uuid || item.id || index;
                objResult[uuid] = item;
            });
            return objResult;
        }
    }
});
