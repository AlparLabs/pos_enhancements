import { describe, expect, test } from "@odoo/hoot";
import {
    GRID,
    LIST,
    STORAGE_KEY,
    readStoredMode,
    resolveInitialMode,
    storeMode,
} from "@pos_product_list_view/app/view_mode";

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => {
            data[k] = String(v);
        },
        _data: data,
    };
}

describe("resolveInitialMode", () => {
    test("uses the stored mode when there is one", () => {
        expect(resolveInitialMode(LIST, GRID)).toBe(LIST);
        expect(resolveInitialMode(GRID, LIST)).toBe(GRID);
    });

    test("falls back to the config default when nothing is stored", () => {
        expect(resolveInitialMode(null, LIST)).toBe(LIST);
        expect(resolveInitialMode(null, GRID)).toBe(GRID);
    });

    test("falls back to grid when the config default is missing or unknown", () => {
        expect(resolveInitialMode(null, undefined)).toBe(GRID);
        expect(resolveInitialMode(null, "kanban")).toBe(GRID);
    });

    test("ignores a corrupted stored value and uses the config default", () => {
        expect(resolveInitialMode("bogus", LIST)).toBe(LIST);
    });
});

describe("readStoredMode", () => {
    test("returns null when nothing was ever stored", () => {
        expect(readStoredMode(fakeStorage())).toBe(null);
    });

    test("returns the stored mode", () => {
        expect(readStoredMode(fakeStorage({ [STORAGE_KEY]: LIST }))).toBe(LIST);
    });

    test("returns null when storage throws", () => {
        const hostile = {
            getItem() {
                throw new Error("SecurityError");
            },
        };
        expect(readStoredMode(hostile)).toBe(null);
    });
});

describe("storeMode", () => {
    test("writes the mode under the storage key", () => {
        const storage = fakeStorage();
        storeMode(storage, LIST);
        expect(storage._data[STORAGE_KEY]).toBe(LIST);
    });

    test("does not throw when storage is unavailable", () => {
        const hostile = {
            setItem() {
                throw new Error("QuotaExceededError");
            },
        };
        expect(() => storeMode(hostile, LIST)).not.toThrow();
    });
});
