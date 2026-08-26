import { describe, expect, test } from "@odoo/hoot";
import {
    insertComboHeaders,
    resolveKitchenGroup,
    sortChangeLines,
} from "@pos_kitchen_receipt_grouping/app/kitchen_group";

const STARTERS = { name: "Entradas", sequence: 10 };
const MAINS = { name: "Principales", sequence: 20 };

describe("resolveKitchenGroup", () => {
    test("uses the group of the product when it has one", () => {
        const product = {
            kitchen_group_id: STARTERS,
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, kitchen_sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Entradas", index: 10 });
    });

    test("reads the product group through product_tmpl_id when not on the variant", () => {
        const product = {
            product_tmpl_id: { kitchen_group_id: STARTERS },
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, kitchen_sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Entradas", index: 10 });
    });

    test("falls back to the group of the first POS category", () => {
        const product = {
            pos_categ_ids: [{ name: "Minutas", kitchen_group_id: MAINS, kitchen_sequence: 5 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Principales", index: 20 });
    });

    test("falls back to the category itself when it has no group", () => {
        const product = {
            pos_categ_ids: [{ name: "Bebidas", kitchen_sequence: 40 }],
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
            pos_categ_ids: [{ name: "Bebidas", kitchen_sequence: 40 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });

    test("uses only the first POS category, ignoring the rest", () => {
        const product = {
            pos_categ_ids: [
                { name: "Bebidas", kitchen_sequence: 40 },
                { name: "Minutas", kitchen_group_id: MAINS, kitchen_sequence: 5 },
            ],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });
});

describe("sortChangeLines", () => {
    const PASTAS = { name: "Pastas", kitchen_sequence: 30 };
    const BURGERS = { name: "Hamburguesas", kitchen_sequence: 10 };
    const URGENTE = { name: "Urgente", kitchen_sequence: 0 };

    function products(map) {
        return (change) => map[change.product_id];
    }

    test("orders lines by the kitchen sequence of their category", () => {
        const changes = [
            { product_id: 1, basic_name: "Arroz con pollo" },
            { product_id: 2, basic_name: "Zeta burger" },
        ];
        const sorted = sortChangeLines(
            changes,
            products({ 1: { pos_categ_ids: [PASTAS] }, 2: { pos_categ_ids: [BURGERS] } })
        );
        expect(sorted.map((c) => c.basic_name)).toEqual(["Zeta burger", "Arroz con pollo"]);
    });

    test("keeps the load order within the same kitchen sequence", () => {
        const changes = [
            { product_id: 1, basic_name: "Triple" },
            { product_id: 2, basic_name: "Doble cheddar" },
        ];
        const sorted = sortChangeLines(
            changes,
            products({ 1: { pos_categ_ids: [BURGERS] }, 2: { pos_categ_ids: [BURGERS] } })
        );
        expect(sorted.map((c) => c.basic_name)).toEqual(["Triple", "Doble cheddar"]);
    });

    test("keeps identical lines in their original order", () => {
        const changes = [
            { product_id: 1, basic_name: "Doble cheddar", uuid: "a" },
            { product_id: 1, basic_name: "Doble cheddar", uuid: "b" },
        ];
        const sorted = sortChangeLines(changes, products({ 1: { pos_categ_ids: [BURGERS] } }));
        expect(sorted.map((c) => c.uuid)).toEqual(["a", "b"]);
    });

    test("respects a kitchen sequence of 0 instead of falling back to the default", () => {
        const changes = [
            { product_id: 1, basic_name: "Doble cheddar" },
            { product_id: 2, basic_name: "Pedido urgente" },
        ];
        const sorted = sortChangeLines(
            changes,
            products({ 1: { pos_categ_ids: [BURGERS] }, 2: { pos_categ_ids: [URGENTE] } })
        );
        expect(sorted.map((c) => c.basic_name)).toEqual(["Pedido urgente", "Doble cheddar"]);
    });

    test("gives a line with an unknown product the default sequence", () => {
        const changes = [
            { product_id: 9, basic_name: "Fantasma" },
            { product_id: 1, basic_name: "Doble cheddar" },
        ];
        const sorted = sortChangeLines(changes, products({ 1: { pos_categ_ids: [BURGERS] } }));
        expect(sorted.map((c) => c.basic_name)).toEqual(["Fantasma", "Doble cheddar"]);
    });

    test("returns an empty array unchanged", () => {
        expect(sortChangeLines([], () => undefined)).toEqual([]);
    });

    test("does not mutate the array it receives", () => {
        const changes = [
            { product_id: 1, basic_name: "Zeta" },
            { product_id: 2, basic_name: "Arroz" },
        ];
        sortChangeLines(
            changes,
            products({ 1: { pos_categ_ids: [PASTAS] }, 2: { pos_categ_ids: [BURGERS] } })
        );
        expect(changes.map((c) => c.basic_name)).toEqual(["Zeta", "Arroz"]);
    });
});

describe("sortChangeLines with combos", () => {
    const BURGERS = { name: "Hamburguesas", kitchen_sequence: 10 };
    const products = (map) => (change) => map[change.product_id];
    const all = { 1: { pos_categ_ids: [BURGERS] } };

    test("keeps the children of a combo together", () => {
        const changes = [
            { product_id: 1, basic_name: "Milanesa", combo_parent_uuid: "c1" },
            { product_id: 1, basic_name: "Suelto" },
            { product_id: 1, basic_name: "Papas", combo_parent_uuid: "c1" },
        ];
        const sorted = sortChangeLines(changes, products(all));
        expect(sorted.map((c) => c.basic_name)).toEqual(["Milanesa", "Papas", "Suelto"]);
    });

    test("keeps two different combos apart", () => {
        const changes = [
            { product_id: 1, basic_name: "A1", combo_parent_uuid: "c1" },
            { product_id: 1, basic_name: "B1", combo_parent_uuid: "c2" },
            { product_id: 1, basic_name: "A2", combo_parent_uuid: "c1" },
        ];
        const sorted = sortChangeLines(changes, products(all));
        expect(sorted.map((c) => c.basic_name)).toEqual(["A1", "A2", "B1"]);
    });
});

describe("insertComboHeaders", () => {
    const G = { name: "Principales", index: 20 };

    test("adds one header per run of children of the same combo", () => {
        const changes = [
            { basic_name: "Milanesa", combo_parent_uuid: "c1", combo_name: "Menu", group: G },
            { basic_name: "Papas", combo_parent_uuid: "c1", combo_name: "Menu", group: G },
            { basic_name: "Suelto", group: G },
        ];
        const out = insertComboHeaders(changes);
        expect(out.map((c) => c.basic_name)).toEqual(["Menu", "Milanesa", "Papas", "Suelto"]);
        expect(out[0].isComboHeader).toBe(true);
        expect(out[0].group).toBe(G);
    });

    test("adds a header for each of two different combos", () => {
        const changes = [
            { basic_name: "A", combo_parent_uuid: "c1", combo_name: "Menu 1", group: G },
            { basic_name: "B", combo_parent_uuid: "c2", combo_name: "Menu 2", group: G },
        ];
        expect(insertComboHeaders(changes).map((c) => c.basic_name)).toEqual([
            "Menu 1", "A", "Menu 2", "B",
        ]);
    });

    test("adds a header again when the run is interrupted", () => {
        const changes = [
            { basic_name: "A", combo_parent_uuid: "c1", combo_name: "Menu", group: G },
            { basic_name: "Suelto", group: G },
            { basic_name: "B", combo_parent_uuid: "c1", combo_name: "Menu", group: G },
        ];
        expect(insertComboHeaders(changes).map((c) => c.basic_name)).toEqual([
            "Menu", "A", "Suelto", "Menu", "B",
        ]);
    });

    test("leaves lines without a combo untouched", () => {
        const changes = [{ basic_name: "Suelto", group: G }];
        expect(insertComboHeaders(changes)).toEqual(changes);
    });

    test("adds no header when the combo name is unknown", () => {
        const changes = [{ basic_name: "A", combo_parent_uuid: "c1", combo_name: "", group: G }];
        expect(insertComboHeaders(changes).map((c) => c.basic_name)).toEqual(["A"]);
    });

    test("does not mutate the array it receives", () => {
        const changes = [
            { basic_name: "A", combo_parent_uuid: "c1", combo_name: "Menu", group: G },
        ];
        insertComboHeaders(changes);
        expect(changes.length).toBe(1);
    });
});
