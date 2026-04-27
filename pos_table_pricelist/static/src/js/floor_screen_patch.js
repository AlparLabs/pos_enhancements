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
     * In Odoo 18 POS Restaurant, `clickTable` is the method called
     * when the cashier taps a table on the floor screen.
     */
    async clickTable(table) {
        this._applyTablePricelist(table);
        return super.clickTable(...arguments);
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

        // pos_pricelist_id is loaded as [id, name] (Many2one tuple) or false
        const rawValue = table.pos_pricelist_id;
        const pricelistId = Array.isArray(rawValue) ? rawValue[0] : (rawValue || false);

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

        // No table-specific pricelist (or not found) → revert to POS default
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
        return (this.pos.models["product.pricelist"] || []).find((pl) => pl.id === id);
    },

    /**
     * Get the default pricelist from the POS config.
     * pos.config.pricelist_id is loaded as [id, name] or false.
     *
     * @returns {Object|null}
     */
    _getDefaultPricelist() {
        const raw = this.pos.config.pricelist_id;
        if (!raw) return null;
        const id = Array.isArray(raw) ? raw[0] : raw;
        return this._findPricelistById(id) || null;
    },

    /**
     * Apply the given pricelist to the current order and POS session state.
     *
     * @param {Object} pricelist  - product.pricelist record from POS models
     */
    _setPricelist(pricelist) {
        if (!pricelist) return;

        // Apply to the currently active order
        const order = this.pos.get_order();
        if (order && typeof order.set_pricelist === "function") {
            order.set_pricelist(pricelist);
        }

        // Update the session-level selected pricelist for future orders
        if (this.pos.selectedPricelist !== pricelist) {
            this.pos.selectedPricelist = pricelist;
        }
    },
});
