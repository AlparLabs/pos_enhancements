/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { receiptLineGrouper } from "@point_of_sale/app/models/utils/order_change";
import { patch } from "@web/core/utils/patch";
import { resolveKitchenGroup, sortChangeLines } from "@pos_kitchen_receipt_grouping/app/kitchen_group";

// Traducción de títulos de recibos de cocina al español.
// El core arma los títulos con _t() en inglés al generar los datos.
const RECEIPT_LABELS = {
    "NEW": "NUEVO",
    "CANCELLED": "CANCELADO",
    "NOTE UPDATE": "CAMBIO DE NOTA",
};

// Helper: Determine if a product is a combo "container" (it has combo_ids — it's the parent)
function isComboParent(product) {
    return Array.isArray(product?.combo_ids) && product.combo_ids.length > 0;
}

/**
 * v19 extension hook: asigna a cada línea el bloque del ticket de cocina. El
 * core agrupa por `group.name` y ordena los bloques por `group.index` (ver
 * PosStore.prepareReceiptGroupedData), así que la secuencia del grupo de cocina
 * define el orden de los bloques. La resolución vive en kitchen_group.js.
 */
receiptLineGrouper.getGroup = function (orderline) {
    const product = orderline.getProduct?.() || orderline.product_id;
    return resolveKitchenGroup(product);
};

patch(PosStore.prototype, {
    /**
     * Add the table number so the receipt header can show "Mesa X".
     */
    getOrderData(order, reprint) {
        const data = super.getOrderData(...arguments);
        data.table_name = order.table_id?.table_number?.toString() || "";
        return data;
    },

    /**
     * Filters changes by printer categories with strict per-item category routing:
     *  - Combo children (e.g. Drinks inside a Food combo) are strictly filtered by their
     *    own product category, ensuring each station only receives items it prepares.
     *  - Combo parents are kept if at least one child is routed to this printer OR if
     *    the parent's own category matches (fallback when children are routed elsewhere).
     *  - Standalone lines are filtered by their own category.
     */
    filterChangeByCategories(categories, currentOrderChange) {
        if (!categories || !categories.length) {
            return currentOrderChange;
        }
        const matchesCategories = (change) => {
            const product = this.models["product.product"]?.get(change.product_id);
            return (product?.parentPosCategIds || []).some((id) => categories.includes(id));
        };

        const filterChanges = (changes = []) => {
            const validComboUuids = new Set(
                changes
                    .filter((change) => change.combo_parent_uuid && matchesCategories(change))
                    .map((change) => change.combo_parent_uuid)
            );
            return changes.filter((change) => {
                if (change.combo_parent_uuid) {
                    return matchesCategories(change);
                }
                if (change.isCombo) {
                    return validComboUuids.has(change.uuid) || matchesCategories(change);
                }
                return matchesCategories(change);
            });
        };

        return {
            new: filterChanges(currentOrderChange.new),
            cancelled: filterChanges(currentOrderChange.cancelled),
            noteUpdate: filterChanges(currentOrderChange.noteUpdate),
        };
    },

    /**
     * Pre-process the change lines before the core groups them by category:
     *  - Skip combo parents whose children are also printed on this receipt
     *    (the children already carry the [Parent] tag, the parent is redundant).
     *  - Guardar el nombre del combo padre en `combo_name`, sin tocar el nombre
     *    del producto. El template lo imprime como "[COMBO]" en cuerpo chico
     *    detrás del producto: así el nombre del plato sigue dominando la línea
     *    y el combo no se lleva el ancho del ticket.
     *  - Merge identical lines (same product, name, notes and variants) by
     *    summing quantities.
     *  - Mantener juntos los hijos de un mismo combo. Dentro del bloque las
     *    líneas salen en el orden en que se cargaron; lo único que se reordena
     *    es lo que quedó separado de su combo.
     * Also translate the receipt title to Spanish.
     */
    async prepareReceiptGroupedData(data) {
        const changes = data.changes?.data;
        if (changes?.length) {
            const parentUuidsWithChildren = new Set(
                changes.filter((c) => c.combo_parent_uuid).map((c) => c.combo_parent_uuid)
            );
            const processed = [];
            const byKey = {};
            for (const change of changes) {
                const product = this.models["product.product"]?.get(change.product_id);
                if (
                    (change.isCombo || isComboParent(product)) &&
                    parentUuidsWithChildren.has(change.uuid)
                ) {
                    continue;
                }
                const name = change.basic_name || change.name;
                let comboName = "";
                if (change.combo_parent_uuid) {
                    const parentLine = this.models["pos.order.line"].getBy(
                        "uuid",
                        change.combo_parent_uuid
                    );
                    comboName =
                        parentLine?.getProduct?.()?.display_name ||
                        changes.find((c) => c.uuid === change.combo_parent_uuid)?.basic_name ||
                        "";
                }
                const key = [
                    change.product_id,
                    name,
                    change.combo_parent_uuid || "",
                    change.note || "",
                    change.customer_note || "",
                    (change.attribute_value_names || []).join(","),
                ].join("|");
                if (byKey[key]) {
                    byKey[key].quantity += change.quantity;
                    continue;
                }
                const entry = { ...change, basic_name: name, combo_name: comboName };
                byKey[key] = entry;
                processed.push(entry);
            }
            data.changes.data = sortChangeLines(processed);
        }
        if (data.changes?.title) {
            data.changes.title = RECEIPT_LABELS[data.changes.title] || data.changes.title;
        }
        return super.prepareReceiptGroupedData(data);
    },
});
