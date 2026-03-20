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
        if (!changes || Object.keys(changes).length === 0) {
            return changes;
        }

        const grouped = {};
        
        // changes is usually an Object { uuid: { name: '...', quantity: 1, ... } }
        for (const [uuid, lineData] of Object.entries(changes)) {
            // Find the orderline using the UUID (which is the key of the changes object)
            // In Odoo 18, this should be the primary key in the UI
            const orderline = this.models["pos.order.line"].getBy("uuid", uuid) 
                            || this.models["pos.order.line"].getBy("id", uuid)
                            || this.lines.find(l => l.uuid === uuid || l.id === uuid);

            // Fallback to name match if UUID search fails (shouldn't happen)
            let finalOrderline = orderline;
            if (!finalOrderline) {
                finalOrderline = this.lines.find((l) => l.get_product().display_name === lineData.name || l.get_full_product_name() === lineData.name);
            }

            const course_uuid = finalOrderline?.course_id?.uuid || "";
            const category = finalOrderline?.product_id?.pos_categ_ids?.[0];
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
                    course_id: finalOrderline?.course_id,
                    pos_category_sequence: categorySequence,
                    pos_category_name: categoryName,
                    _first_uuid: uuid // Track the first UUID of this group to use as a key
                };
            }
        }

        // Convert grouped object to sorted list
        let resultList = Object.values(grouped);
        
        // Sort by Category Sequence, then Category Name, then Product Name
        resultList.sort((a, b) => {
            if (a.pos_category_sequence !== b.pos_category_sequence) {
                return a.pos_category_sequence - b.pos_category_sequence;
            }
            if (a.pos_category_name !== b.pos_category_name) {
                return a.pos_category_name.localeCompare(b.pos_category_name);
            }
            return a.name.localeCompare(b.name);
        });

        // Map back to object with the first encounter UUID as key
        const finalResult = {};
        resultList.forEach((item) => {
            const uuid = item._first_uuid;
            delete item._first_uuid;
            finalResult[uuid] = item;
        });

        return finalResult;
    }
});
