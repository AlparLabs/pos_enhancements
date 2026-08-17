import { describe, expect, test } from "@odoo/hoot";
import { pickTaxTotal, priceOptionsFromOrder } from "@pos_product_list_view/app/product_price";

describe("pickTaxTotal", () => {
    const details = { total_included: 121, total_excluded: 100 };

    test("returns the tax-included total when the POS displays taxes in prices", () => {
        expect(pickTaxTotal(details, "total")).toBe(121);
    });

    test("returns the tax-excluded total otherwise", () => {
        expect(pickTaxTotal(details, "subtotal")).toBe(100);
    });

    test("treats a missing setting as tax-included", () => {
        expect(pickTaxTotal(details, undefined)).toBe(121);
    });

    test("treats an unrecognised setting as tax-included", () => {
        expect(pickTaxTotal(details, "kanban")).toBe(121);
    });

    test("returns 0 when there are no tax details", () => {
        expect(pickTaxTotal(null, "total")).toBe(0);
    });
});

describe("priceOptionsFromOrder", () => {
    test("takes pricelist and fiscal position from the current order", () => {
        const pricelist = { id: 7 };
        const fiscalPosition = { id: 3 };
        const order = { pricelist_id: pricelist, fiscal_position_id: fiscalPosition };
        expect(priceOptionsFromOrder(order)).toEqual({ pricelist, fiscalPosition });
    });

    test("returns false for both when there is no order", () => {
        expect(priceOptionsFromOrder(null)).toEqual({
            pricelist: false,
            fiscalPosition: false,
        });
    });

    test("returns false for a field the order leaves unset", () => {
        expect(priceOptionsFromOrder({ pricelist_id: false, fiscal_position_id: false })).toEqual({
            pricelist: false,
            fiscalPosition: false,
        });
    });
});
