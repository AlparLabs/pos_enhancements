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
 *  - Any combo group only has 1 item (native auto-selects those)
 *  - Any combo item requires variant/attribute configuration
 *  - The combo has no groups defined
 *
 * On confirm, the patch:
 *  1. Receives N per-instance payloads from the popup
 *  2. Groups identical payloads (same item choices per group) to minimise order lines
 *  3. For each unique group, calls addLineToCurrentOrder with configure=false and
 *     a pre-built combo_line_ids array (constructed via computeComboItems)
 */

console.log("%c[pos_combo_quick] ✅ Module loaded — ProductScreen patch registered", "color: #4CAF50; font-weight: bold;");

patch(ProductScreen.prototype, {

    /**
     * Entry point — intercepts combo products, delegates the rest to super.
     */
    async addProductToOrder(product) {
        console.log("[pos_combo_quick] addProductToOrder called:", product?.display_name);
        console.log("[pos_combo_quick] isCombo():", product?.isCombo?.(), "combo_ids.length:", product?.combo_ids?.length);

        if (!product.isCombo() || !product.combo_ids?.length) {
            console.log("[pos_combo_quick] → NOT a combo, falling back to native");
            return await super.addProductToOrder(product);
        }

        // Use same shouldShowCombo logic as the native popup:
        // A combo group is "visible" if it has >1 item OR the single item is configurable.
        // If NO group needs user interaction, native auto-confirms — we do the same.
        const hasGroupsNeedingChoice = product.combo_ids.some((combo) => {
            const items = combo.combo_item_ids || [];
            return (
                items.length > 1 ||
                (items.length === 1 && items[0].product_id?.isConfigurable?.())
            );
        });

        console.log("[pos_combo_quick] hasGroupsNeedingChoice:", hasGroupsNeedingChoice);
        console.log("[pos_combo_quick] combo_ids detail:", product.combo_ids.map(c => ({
            name: c.name,
            itemCount: (c.combo_item_ids || []).length,
        })));

        if (!hasGroupsNeedingChoice) {
            console.log("[pos_combo_quick] → All groups have 1 item, delegating to native auto-confirm");
            return await super.addProductToOrder(product);
        }

        // Only fall back if an item has ONLY custom (free-text) attribute values — we can't
        // render a text input inline. Multi-choice no_variant attrs are handled in our popup.
        const hasCustomOnlyAttrs = product.combo_ids.some((combo) =>
            (combo.combo_item_ids || []).some((item) =>
                (item.product_id?.attribute_line_ids || []).some((line) =>
                    (line.product_template_value_ids || []).length > 0 &&
                    (line.product_template_value_ids || []).every((v) => v.is_custom)
                )
            )
        );
        if (hasCustomOnlyAttrs) {
            console.log("[pos_combo_quick] → Custom-only attrs detected, falling back to native");
            return await super.addProductToOrder(product);
        }

        console.log("[pos_combo_quick] → Opening ComboQuickPopup");
        await this._openComboQuickPopup(product);
    },

    /**
     * Opens ComboQuickPopup and processes its result.
     * @param {Object} product - The combo product.product record
     */
    async _openComboQuickPopup(product) {
        // Build the comboGroups descriptor passed to the popup.
        // Only include groups that have items. Exclude qty_free/qty_max — they
        // don't exist in product.combo in Odoo 18.
        const comboGroups = product.combo_ids
            .filter((combo) => (combo.combo_item_ids || []).length > 0)
            .map((combo) => ({
                id: combo.id,
                name: combo.name,
                combo_item_ids: (combo.combo_item_ids || []).map((item) => {
                    // Collect no_variant / dynamic attribute lines that need user selection.
                    // "always" create_variant lines are already resolved in product.product.
                    const attribute_lines = (item.product_id.attribute_line_ids || [])
                        .filter((line) => {
                            const vals = line.product_template_value_ids || [];
                            return (
                                line.attribute_id?.create_variant !== "always" &&
                                vals.length > 1 &&
                                vals.some((v) => !v.is_custom)
                            );
                        })
                        .map((line) => ({
                            id: line.id,
                            name: line.attribute_id?.name || "",
                            values: (line.product_template_value_ids || [])
                                .filter((v) => !v.is_custom)
                                .map((v) => ({
                                    id: v.id,
                                    name: v.name,
                                    price_extra: v.price_extra || 0,
                                })),
                        }));
                    return {
                        id: item.id,
                        name: item.product_id.display_name,
                        extra_price: item.extra_price || 0,
                        _record: item,
                        attribute_lines,
                    };
                }),
            }));

        if (!comboGroups.length) {
            return await super.addProductToOrder(product);
        }

        // makeAwaitable wraps the dialog.add() pattern to return a promise.
        // getPayload is called by the popup's confirm() method.
        const instancePayloads = await makeAwaitable(this.dialog, ComboQuickPopup, {
            productTemplate: product,
            comboGroups,
        });

        if (!instancePayloads) return; // user cancelled

        // ── Smart grouping ───────────────────────────────────────────────────
        // Each element of instancePayloads = one menu instance:
        //   [{ combo_item_id: <record>, configuration: {...} }, ...]
        //
        // We group instances with identical item selections into one order line
        // with qty > 1, and create separate lines for different selections.
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
            // Sub-lines carry the same qty as the parent so pricing is correct when
            // multiple identical menus are grouped into a single order line.
            const comboLineIds = comboPrices.map((cp) => [
                "create",
                {
                    product_id: cp.combo_item_id.product_id,
                    tax_ids: cp.combo_item_id.product_id.taxes_id.map((tax) => ["link", tax]),
                    combo_item_id: cp.combo_item_id,
                    price_unit: cp.price_unit,
                    price_type: "original",
                    order_id: order,
                    qty,                     // ← matches parent qty (fixes multi-unit pricing)
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
            // Include attribute selections in the key so different attr combos get separate lines
            const key = instanceConf.map((slot) => {
                const attrKey = (slot.configuration.attribute_value_ids || []).slice().sort().join("|");
                return `${slot.combo_item_id.id}:${attrKey}`;
            }).join(",");
            if (groups.has(key)) {
                groups.get(key).qty++;
            } else {
                groups.set(key, { instanceConf, qty: 1 });
            }
        }

        return Array.from(groups.values());
    },
});
