import { describe, expect, test } from "@odoo/hoot";
import { suggestAllocation } from "@pos_lot_spool_picker/app/spool_allocation";

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
