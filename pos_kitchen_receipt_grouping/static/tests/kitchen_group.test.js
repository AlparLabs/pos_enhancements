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
