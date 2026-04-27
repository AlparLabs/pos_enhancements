/** @odoo-module **/

/**
 * POS Table Pricelist — PosStore Patch
 *
 * Automatically switches the active POS pricelist when a table is selected:
 *   - If the table has a pos_pricelist_id → switch to that pricelist.
 *   - If the table has no pos_pricelist_id → revert to the POS config default.
 *
 * We patch PosStore.setTableFromUi (same hook used by pos_restaurant_auto_guest_count)
 * rather than FloorScreen.onClickTable, so the pricelist is applied AFTER the order
 * is created/selected but BEFORE showScreen() navigates to ProductScreen.
 * This prevents any screen-mount logic from overwriting our pricelist choice.
 *
 * Compatible with Odoo 18 POS (OWL 2.x).
 */

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    /**
     * @override
     * After the base setTableFromUi selects/creates the order and before
     * showScreen() fires, we apply the table's assigned pricelist.
     */
    async setTableFromUi(table, orderUuid = null) {
        await super.setTableFromUi(...arguments);
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
        if (!this.config.use_pricelist) {
            return;
        }

        // In Odoo 18 reactive models, Many2one fields are resolved to the linked
        // record object directly. We handle both object and raw-id cases.
        const rawValue = table.pos_pricelist_id;
        let pricelistId = false;

        if (rawValue) {
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
        const pricelists = this.models["product.pricelist"];
        if (!pricelists) return undefined;
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
        const raw = this.config.pricelist_id;
        if (!raw) return null;
        if (typeof raw === "object" && raw.id) {
            return raw;
        }
        return this._findPricelistById(raw) || null;
    },

    /**
     * Apply the given pricelist to the currently active order.
     * In Odoo 18, pricelist is set via order.update() (reactive model).
     *
     * @param {Object} pricelist  - product.pricelist record from POS models
     */
    _setPricelist(pricelist) {
        if (!pricelist) return;

        const order = this.get_order();
        if (!order) return;

        if (typeof order.set_pricelist === "function") {
            // Compatibility path (Odoo 17 or community backports)
            order.set_pricelist(pricelist);
        } else {
            order.update({ pricelist_id: pricelist });
        }
    },
});
