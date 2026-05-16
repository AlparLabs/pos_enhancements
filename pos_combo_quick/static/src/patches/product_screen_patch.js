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
 *  - Any combo item requires only custom (free-text) attribute values
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
     * @param {Object} product - product.template record
     * @returns {Promise<void>}
     */
    async addProductToOrder(product) {
        if (!product.isCombo() || !product.combo_ids?.length) {
            return await super.addProductToOrder(product);
        }

        const hasGroupsNeedingChoice = product.combo_ids.some((combo) => {
            const items = combo.combo_item_ids || [];
            return (
                items.length > 1 ||
                (items.length === 1 && items[0].product_id?.isConfigurable?.())
            );
        });

        if (!hasGroupsNeedingChoice) {
            return await super.addProductToOrder(product);
        }

        // Fall back if any item has ONLY custom (free-text) attribute values — we cannot
        // render text inputs inline. Multi-choice no_variant attrs are handled by our popup.
        const hasCustomOnlyAttrs = product.combo_ids.some((combo) =>
            (combo.combo_item_ids || []).some((item) =>
                (item.product_id?.attribute_line_ids || []).some((line) =>
                    (line.product_template_value_ids || []).length > 0 &&
                    (line.product_template_value_ids || []).every((v) => v.is_custom)
                )
            )
        );
        if (hasCustomOnlyAttrs) {
            return await super.addProductToOrder(product);
        }

        await this._openComboQuickPopup(product);
    },

    /**
     * Opens ComboQuickPopup and processes its result.
     * @param {Object} product - product.template record
     * @returns {Promise<void>}
     */
    async _openComboQuickPopup(product) {
        const comboGroups = product.combo_ids
            .filter((combo) => (combo.combo_item_ids || []).length > 0)
            .map((combo) => ({
                id: combo.id,
                name: combo.name,
                combo_item_ids: (combo.combo_item_ids || []).map((item) => {
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

        const instancePayloads = await makeAwaitable(this.dialog, ComboQuickPopup, {
            productTemplate: product,
            comboGroups,
        });

        if (!instancePayloads) return;

        const groupedInstances = this._groupIdenticalInstances(instancePayloads);
        const order = this.pos.get_order();

        for (const { instanceConf, qty } of groupedInstances) {
            // Pass the product variant as required by computeComboItems in Odoo 19.
            // The 6th arg (childLineExtra=[]) is new in 19.0; currency goes 7th.
            const comboPrices = computeComboItems(
                product.product_variant_ids[0],
                instanceConf,
                order.pricelist_id,
                this.pos.data.models["decimal.precision"].getAll(),
                this.pos.data.models["product.template.attribute.value"].getAllBy("id"),
                [],
                this.pos.currency
            );

            const comboLineIds = comboPrices.map((cp) => [
                "create",
                {
                    product_id: cp.combo_item_id.product_id,
                    tax_ids: cp.combo_item_id.product_id.taxes_id.map((tax) => ["link", tax]),
                    combo_item_id: cp.combo_item_id,
                    price_unit: cp.price_unit,
                    price_type: "original",
                    order_id: order,
                    qty: cp.qty * qty,
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

            await this.pos.addLineToCurrentOrder(
                {
                    product_id: product.product_variant_ids[0],
                    product_tmpl_id: product,
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
     * @param {Array} instancePayloads
     * @returns {Array<{instanceConf: Array, qty: number}>}
     */
    _groupIdenticalInstances(instancePayloads) {
        const groups = new Map();

        for (const instanceConf of instancePayloads) {
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
