import { describe, expect, test } from "@odoo/hoot";
import {
    allocationCoversQty,
    suggestAllocation,
} from "@pos_lot_spool_picker/app/spool_allocation";

describe("suggestAllocation", () => {
    test("picks the smallest single lot that covers the request", () => {
        const lots = [
            { id: 1, name: "A", remaining: 250 },
            { id: 2, name: "B", remaining: 600 },
            { id: 3, name: "C", remaining: 520 },
        ];
        const alloc = suggestAllocation(lots, 500);
        expect(alloc).toEqual([{ id: 3, name: "C", remaining: 520, qty: 500 }]);
    });

    test("combines partials from smallest up when none covers alone", () => {
        const lots = [
            { id: 1, name: "A", remaining: 150 },
            { id: 2, name: "B", remaining: 200 },
            { id: 3, name: "C", remaining: 300 },
        ];
        const alloc = suggestAllocation(lots, 500);
        expect(alloc).toEqual([
            { id: 1, name: "A", remaining: 150, qty: 150 },
            { id: 2, name: "B", remaining: 200, qty: 200 },
            { id: 3, name: "C", remaining: 300, qty: 150 },
        ]);
    });

    test("returns empty allocation for non-positive request", () => {
        expect(suggestAllocation([{ id: 1, name: "A", remaining: 100 }], 0)).toEqual([]);
    });
});

describe("allocationCoversQty", () => {
    test("accepts a sale split across two bobinas", () => {
        // pos.order 8730 (Lavalle - 000002): 134 m + 100 m on a 234 m line. Native rejects
        // this because it counts lots (1 !== 2) and raises "Some Serial/Lot Numbers are missing".
        const allocation = [{ qty: 134 }, { qty: 100 }];
        expect(allocationCoversQty(allocation, 234)).toBe(true);
    });

    test("rejects an under-allocated line", () => {
        expect(allocationCoversQty([{ qty: 134 }, { qty: 60 }], 234)).toBe(false);
    });

    test("accepts a single lot covering the whole line", () => {
        expect(allocationCoversQty([{ qty: 28 }], 28)).toBe(true);
    });

    test("ignores the sign so refunds validate like sales", () => {
        expect(allocationCoversQty([{ qty: 12 }], -12)).toBe(true);
    });

    test("tolerates float noise from fractional meters", () => {
        expect(allocationCoversQty([{ qty: 0.1 }, { qty: 0.2 }], 0.3)).toBe(true);
    });

    test("rejects lots carrying no meters", () => {
        expect(allocationCoversQty([{ lot_name: "A" }, { lot_name: "B" }], 234)).toBe(false);
    });
});
