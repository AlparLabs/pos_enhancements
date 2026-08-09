/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { receiptLineGrouper } from "@point_of_sale/app/models/utils/order_change";
import { patch } from "@web/core/utils/patch";

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
 * v19 extension hook: assign each order line a receipt group based on its POS
 * category. The core groups the change lines by `group.name` and sorts the
 * groups by `group.index` (see PosStore.prepareReceiptGroupedData), so
 * `kitchen_sequence` drives the order of the category blocks on the ticket.
 */
receiptLineGrouper.getGroup = function (orderline) {
    const product = orderline.getProduct?.() || orderline.product_id;
    const categ = product?.pos_categ_ids?.[0];
    if (!categ) {
        return { name: "Sin Categoría", index: 9999 };
    }
    return {
        name: categ.name,
        index: typeof categ.kitchen_sequence === "number" ? categ.kitchen_sequence : 10,
    };
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
     * The core keeps a combo parent line only when at least one of its
     * children is routed to the printer's categories. When the parent's own
     * category matches the printer but all children are routed elsewhere,
     * the parent must still be printed so that station gets the information.
     */
    filterChangeByCategories(categories, currentOrderChange) {
        const result = super.filterChangeByCategories(...arguments);
        const matchesCategories = (change) => {
            const product = this.models["product.product"].get(change.product_id);
            return (product?.parentPosCategIds || []).some((id) => categories.includes(id));
        };
        for (const key of ["new", "cancelled", "noteUpdate"]) {
            const kept = result[key] || [];
            const keptUuids = new Set(kept.map((c) => c.uuid));
            for (const change of currentOrderChange[key] || []) {
                if (change.isCombo && !keptUuids.has(change.uuid) && matchesCategories(change)) {
                    kept.push(change);
                }
            }
        }
        return result;
    },

    /**
     * Pre-process the change lines before the core groups them by category:
     *  - Skip combo parents whose children are also printed on this receipt
     *    (the children already carry the [Parent] tag, the parent is redundant).
     *  - Tag combo children with the parent combo name: "Product [Combo]".
     *    Use the line's own uuid to find the exact orderline — the same product
     *    can appear as a child in multiple different combos.
     *  - Merge identical lines (same product, name, notes and variants) by
     *    summing quantities.
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
                let name = change.basic_name || change.name;
                if (change.combo_parent_uuid) {
                    const parentLine = this.models["pos.order.line"].getBy(
                        "uuid",
                        change.combo_parent_uuid
                    );
                    const parentName =
                        parentLine?.getProduct?.()?.display_name ||
                        changes.find((c) => c.uuid === change.combo_parent_uuid)?.basic_name;
                    if (parentName && !name.includes(`[${parentName}]`)) {
                        name = `${name} [${parentName}]`;
                    }
                }
                const key = [
                    change.product_id,
                    name,
                    change.note || "",
                    change.customer_note || "",
                    (change.attribute_value_names || []).join(","),
                ].join("|");
                if (byKey[key]) {
                    byKey[key].quantity += change.quantity;
                    continue;
                }
                // Drop combo_parent_uuid so the core template does not indent the
                // line — children are shown as normal lines under their category.
                const entry = { ...change, basic_name: name, combo_parent_uuid: undefined };
                byKey[key] = entry;
                processed.push(entry);
            }
            data.changes.data = processed;
        }
        if (data.changes?.title) {
            data.changes.title = RECEIPT_LABELS[data.changes.title] || data.changes.title;
        }
        return super.prepareReceiptGroupedData(data);
    },
});
