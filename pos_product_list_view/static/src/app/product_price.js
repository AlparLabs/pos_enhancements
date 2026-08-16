/**
 * Pick the total the POS is configured to display.
 * `iface_tax_included` is "total" (tax-included) or "subtotal" (tax-excluded).
 * @param {{total_included: number, total_excluded: number}|null} taxDetails
 * @param {string|undefined} ifaceTaxIncluded
 * @returns {number}
 */
export function pickTaxTotal(taxDetails, ifaceTaxIncluded) {
    if (!taxDetails) {
        return 0;
    }
    return ifaceTaxIncluded === "total"
        ? taxDetails.total_included
        : taxDetails.total_excluded;
}

/**
 * Build the options getTaxDetails needs so the listed price matches what the order
 * line will charge. Passing no pricelist makes getPrice return the raw list_price,
 * which is why product.displayPriceUnit cannot be used here.
 * @param {object|null|undefined} order
 * @returns {{pricelist: object|false, fiscalPosition: object|false}}
 */
export function priceOptionsFromOrder(order) {
    return {
        pricelist: order?.pricelist_id || false,
        fiscalPosition: order?.fiscal_position_id || false,
    };
}
