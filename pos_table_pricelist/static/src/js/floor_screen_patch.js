/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    /**
     * @override
     * Apply the table's assigned pricelist after the order is selected/created.
     */
    async setTableFromUi(table, orderUuid = null) {
        await super.setTableFromUi(...arguments);
        this._applyTablePricelist(table);
    },

    _applyTablePricelist(table) {
        if (!table || !this.config.use_pricelist) return;

        const rawValue = table.pos_pricelist_id;
        let pricelistId = false;

        if (rawValue) {
            pricelistId = typeof rawValue === "object" ? rawValue.id : rawValue;
        }

        if (pricelistId) {
            const pricelist = this._findPricelistById(pricelistId);
            if (pricelist) {
                this._setPricelist(pricelist);
                return;
            }
            console.warn(
                `[pos_table_pricelist] Pricelist id=${pricelistId} for table "${table.name}" ` +
                "not found in POS loaded models."
            );
        }

        const defaultPricelist = this._getDefaultPricelist();
        if (defaultPricelist) {
            this._setPricelist(defaultPricelist);
        }
    },

    _findPricelistById(id) {
        const pricelists = this.models["product.pricelist"];
        if (!pricelists) return undefined;
        return typeof pricelists.find === "function"
            ? pricelists.find((pl) => pl.id === id)
            : Object.values(pricelists).find((pl) => pl.id === id);
    },

    _getDefaultPricelist() {
        const raw = this.config.pricelist_id;
        if (!raw) return null;
        if (typeof raw === "object" && raw.id) return raw;
        return this._findPricelistById(raw) || null;
    },

    _setPricelist(pricelist) {
        if (!pricelist) return;
        const order = this.getOrder();
        if (!order) return;

        if (typeof order.setPricelist === "function") {
            order.setPricelist(pricelist);
        } else {
            order.update({ pricelist_id: pricelist });
        }
    },
});
