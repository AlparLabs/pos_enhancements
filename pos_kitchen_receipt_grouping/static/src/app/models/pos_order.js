/** @odoo-module **/

import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    computeChanges(categories) {
        let res = super.computeChanges(categories);
        
        const groupChanges = (changeList) => {
            let groups = {};
            const orderlines = this.get_orderlines();
            
            for (let change of changeList) {
                let product = this.models['product.product'].get(change.product_id);
                if (!product) {
                    product = this.pos?.models['product.product']?.get(change.product_id);
                }
                if (!product) continue;
                
                // Ignorar el Producto Padre del Combo (sólo es un contenedor)
                if (product.type === 'combo' || (Array.isArray(product.combo_ids) && product.combo_ids.length > 0)) {
                    continue; 
                }
                
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
                
                let categoryId = false;
                if (product.pos_categ_ids && product.pos_categ_ids.length > 0) {
                    categoryId = typeof product.pos_categ_ids[0] === 'object' ? product.pos_categ_ids[0].id : product.pos_categ_ids[0];
                }
                
                let categoryName = "Sin Categoría";
                let sequence = 9999;
                
                if (categoryId) {
                    const categ = this.models['pos.category'].get(categoryId) || (this.pos && this.pos.models['pos.category'].get(categoryId));
                    if (categ) {
                        categoryName = categ.name;
                        sequence = categ.kitchen_sequence || 10;
                        if (typeof sequence === 'string') sequence = parseInt(sequence);
                    }
                }
                
                if (!groups[categoryName]) {
                    groups[categoryName] = {
                        name: categoryName,
                        sequence: sequence,
                        lines: []
                    };
                }
                
                const key = `${change.product_id}_${change.name}_${change.note || ''}_${change.customer_note || ''}`;
                let existingLine = groups[categoryName].lines.find(l => l.key === key);
                
                if (existingLine) {
                    existingLine.quantity += change.quantity;
                } else {
                    groups[categoryName].lines.push({ ...change, key: key });
                }
            }
            
            return Object.values(groups).sort((a, b) => a.sequence - b.sequence);
        };
        
        if (res.new && res.new.length > 0) {
            res.grouped_new = groupChanges(res.new);
        } else {
            res.grouped_new = [];
        }
        
        if (res.cancelled && res.cancelled.length > 0) {
            res.grouped_cancelled = groupChanges(res.cancelled);
        } else {
            res.grouped_cancelled = [];
        }
        
        return res;
    }
});
