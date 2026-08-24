/** @odoo-module **/

/**
 * Manual verification (no live Odoo instance available in dev sandbox — verify by hand
 * against a real POS session before shipping):
 * 1. Add a lot-tracked product, split e.g. 1000m across 2-3 bobinas in the popup, confirm.
 *    -> order line shows qty=1000, one line only.
 * 2. Click the lot icon on that same line again. The popup should reopen with the current
 *    split pre-filled (or a fresh suggestion). Change the allocation and confirm again.
 *    -> order line qty updates to match the NEW total; pack_lot_ids reflect the new split.
 * 3. Pay and close the session. Inspect the resulting stock.picking's move lines: they must
 *    match the SECOND (re-edited) allocation, not the first, and must NOT show the full line
 *    quantity duplicated across every lot.
 */

import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { patch } from "@web/core/utils/patch";
import {
    allocatedTotal,
    allocationCoversQty,
} from "@pos_lot_spool_picker/app/spool_allocation";

patch(PosOrderline.prototype, {
    /**
     * Native counts lots to decide a line is complete:
     *
     *     const lotsRequired = this.product_id.tracking == "serial" ? Math.abs(this.qty) : 1;
     *     return lotsRequired === valid_product_lot.length;
     *
     * For lot tracking that means EXACTLY ONE lot per line, so every sale this addon splits
     * across two or more bobinas fails the check and `pay()` raises "Some Serial/Lot Numbers
     * are missing" on a line that is in fact fully allocated. Validate the assigned meters
     * instead: the sum across bobinas must equal the line quantity.
     *
     * Serial tracking, and lot lines with no per-lot meters (native single-lot flow), keep
     * native behaviour exactly.
     */
    hasValidProductLot() {
        if (this.product_id?.tracking !== "lot") {
            return super.hasValidProductLot();
        }
        const validLots = this.getValidLots();
        if (!allocatedTotal(validLots)) {
            // Nothing assigned, or lots without meters — native rules still apply.
            return super.hasValidProductLot();
        }
        return allocationCoversQty(validLots, this.qty);
    },

    /**
     * Native renders one bare label per lot ("Lot Number 124761"), which is all a
     * one-lot-per-line world needs. A spool line splits meters across bobinas, so without
     * the per-lot quantity nobody at the counter can tell whether 234 m is 134+100 or
     * 117+117 — that split only exists in the move lines. Append the assigned meters to
     * each label; lots carrying no meters (native single-lot flow) render unchanged.
     */
    get packLotLines() {
        const labels = super.packLotLines;
        if (this.product_id?.tracking !== "lot") {
            return labels;
        }
        const uom = this.product_id?.uom_id?.name;
        return labels.map((label, index) => {
            const qty = this.pack_lot_ids[index]?.qty;
            if (!qty) {
                return label;
            }
            return uom ? `${label} (${qty} ${uom})` : `${label} (${qty})`;
        });
    },

    setPackLotLines({ modifiedPackLotLines, newPackLotLines, setQuantity = true }) {
        super.setPackLotLines({ modifiedPackLotLines, newPackLotLines, setQuantity });

        // Native setPackLotLines only ever creates pos.pack.operation.lot records with
        // {lot_name, pos_order_line_id} — it drops any custom `qty` (meters) carried on
        // newPackLotLines entries, and setQuantityByLot() (called above via super()) sets
        // the line's qty to the COUNT of lots rather than the sum of assigned meters.
        // Re-apply both here so re-editing an already-split lot-tracked line keeps its
        // per-lot meters — otherwise every lot silently ends up qty=0 and the backend
        // falls back to native's full-line-qty-per-lot behaviour, the exact bug this addon
        // exists to prevent. Only do this when the caller actually wants auto-quantity
        // (mirrors native's own `!to_weight && setQuantity` gate) and the product isn't
        // weight-based, where qty comes from the scale, not the lots.
        if (
            this.product_id?.tracking !== "lot" ||
            this.product_id?.to_weight ||
            !setQuantity ||
            !newPackLotLines?.length
        ) {
            return;
        }
        const qtyByName = Object.fromEntries(
            newPackLotLines.filter((l) => l.qty).map((l) => [l.lot_name, l.qty])
        );
        if (!Object.keys(qtyByName).length) {
            return;
        }
        for (const lotLine of this.pack_lot_ids) {
            if (lotLine.lot_name in qtyByName) {
                lotLine.qty = qtyByName[lotLine.lot_name];
            }
        }
        const total = this.pack_lot_ids.reduce((sum, pl) => sum + (pl.qty || 0), 0);
        if (total > 0 && Math.abs(this.qty - total) > 1e-6) {
            this.setQuantity(total);
        }
    },
});
