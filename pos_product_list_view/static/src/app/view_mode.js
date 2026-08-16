export const GRID = "grid";
export const LIST = "list";
export const STORAGE_KEY = "pos_product_list_view.mode";

const VALID_MODES = [GRID, LIST];

function isValid(mode) {
    return VALID_MODES.includes(mode);
}

/**
 * Read the mode this device chose last time, if any.
 * Storage can throw (private browsing, disabled cookies); treat that as "nothing stored".
 * @param {Storage} storage
 * @returns {string|null}
 */
export function readStoredMode(storage) {
    try {
        return storage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

/**
 * Persist this device's choice. Never let a storage failure break the toggle.
 * @param {Storage} storage
 * @param {string} mode
 */
export function storeMode(storage, mode) {
    try {
        storage.setItem(STORAGE_KEY, mode);
    } catch {
        // Losing persistence is acceptable; losing the toggle is not.
    }
}

/**
 * The device's choice wins over the POS default. The POS default is a seed for
 * devices that have not chosen yet, not a lock.
 * @param {string|null} storedMode
 * @param {string|undefined} configDefault
 * @returns {string}
 */
export function resolveInitialMode(storedMode, configDefault) {
    if (isValid(storedMode)) {
        return storedMode;
    }
    return isValid(configDefault) ? configDefault : GRID;
}
