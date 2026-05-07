/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ComboQuickPopup } from "../combo_quick_popup/ComboQuickPopup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { computeComboItems } from "@point_of_sale/app/models/utils/compute_combo_items";

/**
 * Patches ProductScreen.addProductToOrder to intercept combo products and
 * open ComboQuickPopup instead of the native ComboConfiguratorPopup.
 *
 * Falls back to the native flow when:
 *  - The product is not a combo
 *  - Any combo group contains a configurable product (variant/attributes)
 *  - The combo has no groups defined
 *
 * On confirm, the patch:
 *  1. Receives N per-instance payloads from the popup
 *  2. Groups identical payloads (same item choices per group) to minimise order lines
 *  3. For each unique group, calls addLineToCurrentOrder with configure=false and
 *     a pre-built combo_line_ids array (constructed via computeComboItems)
 */
patch(ProductScreen.prototype, {

    /**
     * Entry point — intercepts combo products, delegates the rest to super.
     */
    async addProductToOrder(product) {
        if (!product.isCombo() || !product.combo_ids?.length) {
            return await super.addProductToOrder(product);
        }

        // Fall back to native popup if any item requires variant configuration
        const hasConfigurableItems = product.combo_ids.some((combo) =>
            combo.combo_item_ids?.some((item) => item.product_id?.isConfigurable?.())
        );
        if (hasConfigurableItems) {
            return await super.addProductToOrder(product);
        }

        await this._openComboQuickPopup(product);
    },

    /**
     * Opens ComboQuickPopup and processes its result.
     * @param {Object} product - The combo product.product record
     */
    async _openComboQuickPopup(product) {
        // Build the comboGroups descriptor passed to the popup.
        // We use combo_item_ids (the real Odoo 18 field) and keep _record
        // references so the patch can call computeComboItems with real records.
        const comboGroups = product.combo_ids.map((combo) => ({
            id: combo.id,
            name: combo.name,
            qty_free: combo.qty_free,
            qty_max: combo.qty_max,
            combo_item_ids: combo.combo_item_ids.map((item) => ({
                id: item.id,
                name: item.product_id.display_name,
                extra_price: item.extra_price || 0,
                _record: item, // raw record needed for computeComboItems
            })),
        }));

        // makeAwaitable wraps the dialog.add() pattern to return a promise.
        // getPayload is called by the popup's confirm() method.
        const instancePayloads = await makeAwaitable(this.dialog, ComboQuickPopup, {
            productTemplate: product,
            comboGroups,
        });

        if (!instancePayloads) return; // user cancelled

        // ── Smart grouping ───────────────────────────────────────────────────
        // Each element of instancePayloads = one menu instance:
        //   [{ combo_item_id: <record>, configuration: {...}, qty: 1 }, ...]
        //
        // We group instances with identical item selections into one order line
        // with qty > 1, and create separate lines for different selections.
        //
        // Example: 5 menus where mains = 3 Milanesa + 1 Spaghetti + 1 Salmon
        //          beverages = 2 Coca + 2 Agua + 1 Fanta (sequential assignment)
        //
        // Sequential pairing:
        //   i=0: Milanesa + Coca   ─┐ identical
        //   i=1: Milanesa + Coca   ─┘ → qty=2
        //   i=2: Milanesa + Agua       → qty=1
        //   i=3: Spaghetti + Agua      → qty=1
        //   i=4: Salmon + Fanta        → qty=1
        //
        // Result: 4 parent order lines instead of 5.

        const groupedInstances = this._groupIdenticalInstances(instancePayloads);

        const order = this.pos.get_order();

        for (const { instanceConf, qty } of groupedInstances) {
            // computeComboItems distributes the parent product price proportionally
            // across sub-items and adds extra_price surcharges.
            const comboPrices = computeComboItems(
                product,
                instanceConf,
                order.pricelist_id,
                this.pos.data.models["decimal.precision"].getAll(),
                this.pos.data.models["product.template.attribute.value"].getAllBy("id"),
                this.pos.currency
            );

            // Build the combo_line_ids payload exactly as pos_store.js does natively.
            const comboLineIds = comboPrices.map((cp) => [
                "create",
                {
                    product_id: cp.combo_item_id.product_id,
                    tax_ids: cp.combo_item_id.product_id.taxes_id.map((tax) => ["link", tax]),
                    combo_item_id: cp.combo_item_id,
                    price_unit: cp.price_unit,
                    price_type: "original",
                    order_id: order,
                    qty: qty, // sub-line qty matches the grouped parent qty
                    attribute_value_ids: (cp.attribute_value_ids || []).map((attr) => ["link", attr]),
                    custom_attribute_value_ids: Object.entries(
                        cp.attribute_custom_values || {}
                    ).map(([id, cus]) => [
                        "create",
                        {
                            custom_product_template_attribute_value_id:
                                this.pos.data.models["product.template.attribute.value"].get(id),
                            custom_value: cus,
                        },
                    ]),
                },
            ]);

            // configure=false → skips the native ComboConfiguratorPopup inside addLineToOrder
            await this.pos.addLineToCurrentOrder(
                {
                    product_id: product,
                    qty,
                    combo_line_ids: comboLineIds,
                },
                {},
                false
            );
        }
    },

    /**
     * Groups identical instance configurations to minimise order lines.
     *
     * @param {Array} instancePayloads - Array of per-instance payload arrays
     * @returns {Array<{instanceConf, qty}>} - Grouped unique configs with qty
     */
    _groupIdenticalInstances(instancePayloads) {
        // Use a string key (JSON of combo_item_id ids) to detect identical configs
        const groups = new Map();

        for (const instanceConf of instancePayloads) {
            const key = instanceConf.map((slot) => slot.combo_item_id.id).join(",");
            if (groups.has(key)) {
                groups.get(key).qty++;
            } else {
                groups.set(key, { instanceConf, qty: 1 });
            }
        }

        return Array.from(groups.values());
    },
});
