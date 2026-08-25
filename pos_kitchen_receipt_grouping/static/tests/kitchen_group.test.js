import { describe, expect, test } from "@odoo/hoot";
import {
    FALLBACK_GROUP_INDEX,
    FALLBACK_GROUP_NAME,
    resolveKitchenGroup,
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
            name: FALLBACK_GROUP_NAME,
            index: FALLBACK_GROUP_INDEX,
        });
    });

    test("returns the fallback block when there is no product at all", () => {
        expect(resolveKitchenGroup(undefined)).toEqual({
            name: FALLBACK_GROUP_NAME,
            index: FALLBACK_GROUP_INDEX,
        });
    });

    test("ignores a group record that has no name", () => {
        const product = {
            kitchen_group_id: { sequence: 3 },
            pos_categ_ids: [{ name: "Bebidas", kitchen_sequence: 40 }],
        };
        expect(resolveKitchenGroup(product)).toEqual({ name: "Bebidas", index: 40 });
    });
});
