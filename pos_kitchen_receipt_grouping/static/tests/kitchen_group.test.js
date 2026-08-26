import { describe, expect, test } from "@odoo/hoot";
import {
    resolveKitchenGroup,
    sortChangeLines,
} from "@pos_kitchen_receipt_grouping/app/kitchen_group";

const STARTERS = { name: "Entradas", sequence: 10 };
const MAINS = { name: "Principales", sequence: 20 };

describe("resolveKitchenGroup", () => {
    test("uses the group of the product when it has one", () => {
        const product = {
            kitchen_group_id: STARTERS,
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Entradas", index: 10 });
    });

    test("reads the product group through product_tmpl_id when not on the variant", () => {
        const product = {
            product_tmpl_id: { kitchen_group_id: STARTERS },
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Entradas", index: 10 });
    });

    test("falls back to the group of the first POS category", () => {
        const product = {
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Principales", index: 20 });
    });

    test("falls back to the category itself when it has no group", () => {
        const product = {
            pos_categ_ids: [{ name: "Bebidas", sequence: 40 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });

    test("uses the default kitchen sequence when the category has none", () => {
        const product = { pos_categ_ids: [{ name: "Bebidas" }] };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 10 });
    });

    test("keeps a group sequence of 0 instead of falling back to the default", () => {
        const product = { kitchen_group_id: { name: "Urgente", sequence: 0 } };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Urgente", index: 0 });
    });

    test("returns the fallback block when the product has no category", () => {
        expect(resolveKitchenGroup({ pos_categ_ids: [] })).toEqual({
            name: "Otros",
            index: 999999,
        });
    });

    test("returns the fallback block when there is no product at all", () => {
        expect(resolveKitchenGroup(undefined)).toEqual({ name: "Otros", index: 999999 });
    });

    test("ignores a group record that has no name", () => {
        const product = {
            kitchen_group_id: { sequence: 3 },
            pos_categ_ids: [{ name: "Bebidas", sequence: 40 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });

    test("uses only the first POS category, ignoring the rest", () => {
        const product = {
            pos_categ_ids: [
                { name: "Bebidas", sequence: 40 },
                { name: "Minutas", kitchen_group_id: MAINS, sequence: 5 },
            ],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });
});

describe("sortChangeLines", () => {
    test("keeps the load order", () => {
        const changes = [{ basic_name: "Zeta" }, { basic_name: "Arroz" }, { basic_name: "Medio" }];
        expect(sortChangeLines(changes).map((c) => c.basic_name)).toEqual([
            "Zeta", "Arroz", "Medio",
        ]);
    });

    test("pulls the children of a combo next to the first one", () => {
        const changes = [
            { basic_name: "Milanesa", combo_parent_uuid: "c1" },
            { basic_name: "Suelto" },
            { basic_name: "Papas", combo_parent_uuid: "c1" },
        ];
        expect(sortChangeLines(changes).map((c) => c.basic_name)).toEqual([
            "Milanesa", "Papas", "Suelto",
        ]);
    });

    test("keeps two different combos apart", () => {
        const changes = [
            { basic_name: "A1", combo_parent_uuid: "c1" },
            { basic_name: "B1", combo_parent_uuid: "c2" },
            { basic_name: "A2", combo_parent_uuid: "c1" },
        ];
        expect(sortChangeLines(changes).map((c) => c.basic_name)).toEqual(["A1", "A2", "B1"]);
    });

    test("keeps identical lines in their original order", () => {
        const changes = [{ uuid: "a" }, { uuid: "b" }];
        expect(sortChangeLines(changes).map((c) => c.uuid)).toEqual(["a", "b"]);
    });

    test("returns an empty array unchanged", () => {
        expect(sortChangeLines([])).toEqual([]);
    });

    test("does not mutate the array it receives", () => {
        const changes = [
            { basic_name: "Milanesa", combo_parent_uuid: "c1" },
            { basic_name: "Suelto" },
            { basic_name: "Papas", combo_parent_uuid: "c1" },
        ];
        sortChangeLines(changes);
        expect(changes.map((c) => c.basic_name)).toEqual(["Milanesa", "Suelto", "Papas"]);
    });
});
