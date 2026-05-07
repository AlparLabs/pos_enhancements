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
patch(ProductScreen.prototype, {

    /**
     * Entry point — intercepts combo products, delegates the rest to super.
     */
    async addProductToOrder(product) {
        if (!product.isCombo() || !product.combo_ids?.length) {
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

        if (!hasGroupsNeedingChoice) {
            // All groups have exactly 1 non-configurable item — let native auto-confirm
            return await super.addProductToOrder(product);
        }

        // Fall back to native popup if any item requires variant/attribute configuration
        const hasConfigurableItems = product.combo_ids.some((combo) =>
            (combo.combo_item_ids || []).some((item) => item.product_id?.isConfigurable?.())
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
        // Only include groups that have items. Exclude qty_free/qty_max — they
        // don't exist in product.combo in Odoo 18.
        const comboGroups = product.combo_ids
            .filter((combo) => (combo.combo_item_ids || []).length > 0)
            .map((combo) => ({
                id: combo.id,
                name: combo.name,
                combo_item_ids: (combo.combo_item_ids || []).map((item) => ({
                    id: item.id,
                    name: item.product_id.display_name,
                    extra_price: item.extra_price || 0,
                    _record: item, // raw record needed for computeComboItems
                })),
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
            // Sub-lines always have qty=1 (each represents one unique combo configuration).
            const comboLineIds = comboPrices.map((cp) => [
                "create",
                {
                    product_id: cp.combo_item_id.product_id,
                    tax_ids: cp.combo_item_id.product_id.taxes_id.map((tax) => ["link", tax]),
                    combo_item_id: cp.combo_item_id,
                    price_unit: cp.price_unit,
                    price_type: "original",
                    order_id: order,
                    qty: 1,
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
