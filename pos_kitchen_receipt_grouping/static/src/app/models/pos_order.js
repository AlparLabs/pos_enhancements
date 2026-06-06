/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    computeChanges(categories) {
        let res = super.computeChanges(categories);
        
        const appendComboParentName = (changeList) => {
            const orderlines = this.get_orderlines();
            // Index by uuid for O(1) lookup — avoids matching wrong parent when the
            // same product appears as a child in multiple different combos.
            const lineByUuid = {};
            for (const ol of orderlines) {
                lineByUuid[ol.uuid] = ol;
            }

            for (let change of changeList) {
                const matchingLine = lineByUuid[change.uuid];
                if (!matchingLine || !matchingLine.combo_parent_id) continue;
                const pid = matchingLine.combo_parent_id;
                const parentLine = lineByUuid[pid?.uuid || pid] || orderlines.find(l => l.id === pid);
                if (parentLine) {
                    const parentName = parentLine.get_product().display_name;
                    if (!change.name.includes(`[${parentName}]`)) {
                        change.name = `${change.name} [${parentName}]`;
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
