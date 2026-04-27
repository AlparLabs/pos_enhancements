/** @odoo-module **/

/**
 * POS Table Pricelist — Floor Screen Patch
 *
 * Automatically switches the active POS pricelist when a table is selected:
 *   - If the table has a pos_pricelist_id → switch to that pricelist.
 *   - If the table has no pos_pricelist_id → revert to the POS config default.
 *
 * Compatible with Odoo 18 POS (OWL 2.x).
 */

import { patch } from "@web/core/utils/patch";
import { FloorScreen } from "@pos_restaurant/app/floor_screen/floor_screen";

patch(FloorScreen.prototype, {
    /**
     * Override the table click handler.
     *
     * In Odoo 18 POS Restaurant, the real method is `onClickTable(table, ev)`.
     * We call super first so the order is selected/created, then apply the pricelist.
     */
    async onClickTable(table, ev) {
        await super.onClickTable(...arguments);
        // After super, the order for this table is now active — apply pricelist.
        this._applyTablePricelist(table);
    },

    /**
     * Switch the active pricelist based on the selected table.
     * If the table has no pricelist, restore the POS config default.
     *
     * @param {Object} table  - The restaurant.table record from POS models
     */
    _applyTablePricelist(table) {
        if (!table) return;

        // Pricelist feature must be enabled on this POS config
        if (!this.pos.config.use_pricelist) {
            return;
        }

        // In Odoo 18 reactive models, Many2one fields are already resolved to
        // the linked record object (not a [id, name] tuple). Fallback to id lookup.
        const rawValue = table.pos_pricelist_id;
        let pricelistId = false;

        if (rawValue) {
            // Could be a record object (has .id) or a plain id number
            pricelistId = typeof rawValue === "object" ? rawValue.id : rawValue;
        }

        if (pricelistId) {
            // Table has an assigned pricelist — find it in the POS loaded models
            const pricelist = this._findPricelistById(pricelistId);
            if (pricelist) {
                this._setPricelist(pricelist);
                return;
            }
            console.warn(
                `[pos_table_pricelist] Pricelist id=${pricelistId} for table "${table.name}" ` +
                "not found in POS loaded models. " +
                "Ensure the pricelist is included in the POS configuration."
            );
        }

        // No table-specific pricelist (or not found) → revert to POS config default
        const defaultPricelist = this._getDefaultPricelist();
        if (defaultPricelist) {
            this._setPricelist(defaultPricelist);
        }
    },

    /**
     * Find a pricelist by id in the POS models registry.
     *
     * @param {Number} id
     * @returns {Object|undefined}
     */
    _findPricelistById(id) {
        const pricelists = this.pos.models["product.pricelist"];
        if (!pricelists) return undefined;
        // In Odoo 18, models[key] is a ModelCollection with a .find() method
        return typeof pricelists.find === "function"
            ? pricelists.find((pl) => pl.id === id)
            : Object.values(pricelists).find((pl) => pl.id === id);
    },

    /**
     * Get the default pricelist from the POS config.
     * In Odoo 18, config.pricelist_id is already a resolved record or false.
     *
     * @returns {Object|null}
     */
    _getDefaultPricelist() {
        const raw = this.pos.config.pricelist_id;
        if (!raw) return null;
        // If it's already a record object, return it directly
        if (typeof raw === "object" && raw.id) {
            return raw;
        }
        // Otherwise treat it as an id
        return this._findPricelistById(raw) || null;
    },

    /**
     * Apply the given pricelist to the currently active order.
     * In Odoo 18, pricelist is set via direct reactive assignment on the order.
     *
     * @param {Object} pricelist  - product.pricelist record from POS models
     */
    _setPricelist(pricelist) {
        if (!pricelist) return;

        const order = this.pos.get_order();
        if (!order) return;

        // In Odoo 18 the order model is reactive — direct assignment triggers reactivity.
        // set_pricelist() does not exist; use update() or direct field assignment.
        if (typeof order.set_pricelist === "function") {
            // Older compatibility path (Odoo 17 or community backports)
            order.set_pricelist(pricelist);
        } else {
            order.update({ pricelist_id: pricelist });
        }
    },
});
