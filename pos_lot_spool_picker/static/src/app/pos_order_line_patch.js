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

patch(PosOrderline.prototype, {
    setPackLotLines({ modifiedPackLotLines, newPackLotLines, setQuantity = true }) {
        super.setPackLotLines({ modifiedPackLotLines, newPackLotLines, setQuantity });

        // Native setPackLotLines only ever creates pos.pack.operation.lot records with
        // {lot_name, pos_order_line_id} — it drops any custom `qty` (meters) carried on
        // newPackLotLines entries, and setQuantityByLot() (called above via super()) sets
        // the line's qty to the COUNT of lots rather than the sum of assigned meters.
        // Re-apply both here so re-editing an already-split lot-tracked line keeps its
        // per-lot meters — otherwise every lot silently ends up qty=0 and the backend
        // falls back to native's full-line-qty-per-lot behaviour, the exact bug this addon
        // exists to prevent.
        if (this.product_id?.tracking !== "lot" || !newPackLotLines?.length) {
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
