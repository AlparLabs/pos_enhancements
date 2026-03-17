/** @odoo-module **/

/**
 * No JavaScript patch required.
 *
 * In Odoo 18, the `point_of_sale.Orderline` template already exposes
 * `line.comboParent` (camelCase) on every receipt line, used internally
 * to apply the `orderline-combo ms-4 fst-italic` CSS classes.
 *
 * We simply inherit the template in order_receipt.xml and use that
 * existing property to conditionally hide the price divs.
 */
