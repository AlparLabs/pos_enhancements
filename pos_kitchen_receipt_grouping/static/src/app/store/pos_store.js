/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";

// Traducción de etiquetas de recibos de cocina al español
const RECEIPT_LABELS = {
    "New": "Nuevo",
    "Note": "Nota",
    "Cancelled": "Cancelado",
    "Cancel": "Cancelar",
    "Message": "Mensaje",
};

// Helper: Get a product's first POS category with name and kitchen_sequence
function getProductCategory(product, models) {
    if (!product || !product.pos_categ_ids || product.pos_categ_ids.length === 0) {
        return { name: "Sin Categoría", sequence: 9999 };
    }
    const categId = typeof product.pos_categ_ids[0] === "object"
        ? product.pos_categ_ids[0].id
        : product.pos_categ_ids[0];
    const categ = models["pos.category"]?.get(categId);
    if (!categ) return { name: "Sin Categoría", sequence: 9999 };
    return {
        name: categ.name,
        sequence: typeof categ.kitchen_sequence === "number" ? categ.kitchen_sequence : 10,
    };
}

// Helper: Determine if a product is a combo "container" (it has combo_ids — it's the parent)
function isComboParent(product) {
    return Array.isArray(product.combo_ids) && product.combo_ids.length > 0;
}

patch(PosStore.prototype, {
    async getRenderedReceipt(order, title, lines, fullReceipt = false, diningModeUpdate) {
        const orderlines = order.get_orderlines();

        // Build a lookup: uuid → orderline, for fast access
        const lineByUuid = {};
        for (const ol of orderlines) {
            lineByUuid[ol.uuid] = ol;
        }

        // Group lines by category (skip combo parents, tag combo children)
        const groupChangesByCategory = (changeLines) => {
            const categoryMap = {};

            for (const change of changeLines) {
                const product = this.models["product.product"]?.get(change.product_id);
                if (!product) continue;

                // Skip combo parents — they are just containers
                if (isComboParent(product)) continue;

                // Detect if this line is a combo child and append parent label
                let displayName = change.name;
                const matchingLine = orderlines.find(
                    (ol) => ol.get_product().id === change.product_id && ol.combo_parent_id
                );
                if (matchingLine) {
                    const parentLine = lineByUuid[
                        matchingLine.combo_parent_id?.uuid || matchingLine.combo_parent_id
                    ];
                    if (parentLine) {
                        const parentName = parentLine.get_product().display_name;
                        if (!displayName.includes(`[${parentName}]`)) {
                            displayName = `${displayName} [${parentName}]`;
                        }
                    }
                }

                const { name: categName, sequence } = getProductCategory(product, this.models);

                if (!categoryMap[categName]) {
                    categoryMap[categName] = {
                        name: categName,
                        sequence,
                        lines: [],
                    };
                }
                
                const key = `${change.product_id}_${displayName}_${change.note || ''}_${change.customer_note || ''}`;
                const existing = categoryMap[categName].lines.find(l => l.key === key);
                
                if (existing) {
                    existing.quantity += change.quantity;
                } else {
                    categoryMap[categName].lines.push({ ...change, name: displayName, key: key });
                }
            }

            return Object.values(categoryMap).sort((a, b) => a.sequence - b.sequence);
        };

        if (lines) {
            lines.changedByCategory = groupChangesByCategory(lines);
        }

        return super.getRenderedReceipt(order, RECEIPT_LABELS[title] || title, lines, fullReceipt, diningModeUpdate);
    },

    preparePrintingData(order, changes) {
        // Call the original method to get the English-keyed object
        const original = super.preparePrintingData(order, changes);
        // Re-key using Spanish translations
        const translated = {};
        for (const [key, value] of Object.entries(original)) {
            translated[RECEIPT_LABELS[key] || key] = value;
        }
        return translated;
    },
});
