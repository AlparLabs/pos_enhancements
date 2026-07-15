/** @odoo-module **/

import { PosStore } from "@point_of_sale/app/services/pos_store";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { patch } from "@web/core/utils/patch";
import { SpoolPickerPopup } from "@pos_lot_spool_picker/app/popups/spool_picker_popup/spool_picker_popup";

patch(PosStore.prototype, {
    /**
     * Fetch lots with location + remaining meters for the spool picker.
     * @returns {Promise<{id:number,name:string,remaining:number,location_name:string}[]>}
     */
    async _getSpoolLots(product) {
        const rows = await this.data.call("pos.order.line", "get_existing_lots", [
            this.company.id,
            this.config.id,
            product.id,
        ]);
        return (rows || []).map((r) => ({
            id: r.id,
            name: r.name,
            remaining: r.product_qty,
            location_name: r.location_name || "",
        }));
    },

    async editLots(product, packLotLinesToEdit) {
        // Only take over lot-tracked products; serials keep the native popup.
        if (product.tracking !== "lot") {
            return await super.editLots(product, packLotLinesToEdit);
        }

        let lots;
        try {
            lots = await this._getSpoolLots(product);
        } catch {
            // RPC failed — degrade to native behaviour rather than crash the add-product flow.
            return await super.editLots(product, packLotLinesToEdit);
        }
        if (!lots.length) {
            // Nothing in stock to pick from — fall back to native (create-lot flow).
            return await super.editLots(product, packLotLinesToEdit);
        }

        const requested = Math.abs(parseFloat(this.numberBuffer?.get()) || 0) || 1;
        const allocation = await makeAwaitable(this.dialog, SpoolPickerPopup, {
            productName: product.display_name,
            requested,
            lots,
            enforceStock: !!this.config.spool_picker_enforce_stock,
            refresh: async () => await this._getSpoolLots(product),
        });

        if (!allocation) {
            return null; // cancelled
        }

        // Native shape: existing lots go to newPackLotLines with {lot_name, qty}.
        const newPackLotLines = allocation.map((a) => ({ lot_name: a.lot_name, qty: a.qty }));
        return { modifiedPackLotLines: {}, newPackLotLines };
    },

    async addLineToOrder(vals, order, opts = {}, configure = true) {
        const line = await super.addLineToOrder(vals, order, opts, configure);
        // For lot-tracked lines whose pack lots carry per-lot meters, the customer-facing
        // line qty must equal the total assigned meters (native leaves it at 1 for lots).
        if (line && line.product_id?.tracking === "lot") {
            const total = line.pack_lot_ids.reduce((sum, pl) => sum + (pl.qty || 0), 0);
            if (total > 0 && Math.abs(line.qty - total) > 1e-6) {
                line.setQuantity(total);
            }
        }
        return line;
    },
});
