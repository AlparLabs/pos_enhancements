/**
 * Pick the total the POS is configured to display.
 * `iface_tax_included` is "total" (tax-included) or "subtotal" (tax-excluded).
 * An explicit "subtotal" yields the tax-excluded total; any other value, including
 * undefined, yields the tax-included total, mirroring the core field's own default.
 * @param {{total_included: number, total_excluded: number}|null} taxDetails
 * @param {string|undefined} ifaceTaxIncluded
 * @returns {number}
 */
export function pickTaxTotal(taxDetails, ifaceTaxIncluded) {
    if (!taxDetails) {
        return 0;
    }
    // Mirrors the core default: pos.config.iface_tax_included is required with
    // default='total' (point_of_sale/models/pos_config.py). Anything that is not an
    // explicit "subtotal" therefore falls back to the tax-included price. Falling back
    // the other way would quote the customer a price lower than the register charges.
    return ifaceTaxIncluded === "subtotal"
        ? taxDetails.total_excluded
        : taxDetails.total_included;
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
