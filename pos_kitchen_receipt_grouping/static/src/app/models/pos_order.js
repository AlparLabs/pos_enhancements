/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * @param {Object} categories
     * @returns {Object}
     */
    computeChanges(categories) {
        let res = super.computeChanges(categories);
        
        const appendComboParentName = (changeList) => {
            const orderlines = this.get_orderlines();
            
            for (let change of changeList) {
                // Si es subproducto, agregar nota del padre
                const matchingLines = orderlines.filter(l => l.get_product().id === change.product_id && l.combo_parent_id);
                if (matchingLines.length > 0) {
                    const parentLine = orderlines.find(l => {
                        const pid = matchingLines[0].combo_parent_id;
                        return l.uuid === (pid.uuid || pid) || l.id === pid;
                    });
                    if (parentLine) {
                        const parentName = parentLine.get_product().display_name;
                        // Avoid duplicating the tag
                        if (!change.name.includes(`[${parentName}]`)) {
                            change.name = `${change.name} [${parentName}]`;
                        }
                    }
                }
            }
        };
        
        if (res.new && res.new.length > 0) {
            appendComboParentName(res.new);
        }
        
        if (res.cancelled && res.cancelled.length > 0) {
            appendComboParentName(res.cancelled);
        }
        
        return res;
    }
});
