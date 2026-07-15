/** @odoo-module **/

/**
 * Suggest how to fulfil `requested` meters from `lots`.
 * Rule: if any single lot's remaining >= requested, use the SMALLEST such lot
 * (anti-retazo). Otherwise combine partial lots from smallest remaining upward
 * until the request is covered (or lots run out).
 *
 * @param {{id:number, name:string, remaining:number}[]} lots
 * @param {number} requested
 * @returns {{id:number, name:string, remaining:number, qty:number}[]}
 */
export function suggestAllocation(lots, requested) {
    if (!requested || requested <= 0) {
        return [];
    }
    const sorted = [...lots]
        .filter((l) => l.remaining > 0)
        .sort((a, b) => a.remaining - b.remaining);

    const covering = sorted.find((l) => l.remaining >= requested);
    if (covering) {
        return [{ ...covering, qty: requested }];
    }

    const allocation = [];
    let left = requested;
    for (const lot of sorted) {
        if (left <= 0) {
            break;
        }
        const qty = Math.min(left, lot.remaining);
        allocation.push({ ...lot, qty });
        left -= qty;
    }
    return allocation;
}

/**
 * Total meters assigned across an allocation.
 * @param {{qty:number}[]} allocation
 * @returns {number}
 */
export function allocatedTotal(allocation) {
    return allocation.reduce((sum, a) => sum + (a.qty || 0), 0);
}
