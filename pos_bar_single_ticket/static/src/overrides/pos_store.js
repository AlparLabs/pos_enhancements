/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    /**
     * Override printChanges to split order lines into individual qty=1 lines
     * for products whose POS category has x_print_single_ticket enabled.
     *
     * This only modifies the print data — the actual order remains untouched.
     */
    async printChanges(order, orderChange) {
        const modifiedOrderChange = this._splitSingleTicketLines(orderChange);
        return super.printChanges(order, modifiedOrderChange);
    },

    /**
     * Iterates the "new" lines in the order change and, for any product whose
     * POS category has x_print_single_ticket === true and quantity > 1,
     * replaces that single entry with N copies of quantity 1.
     *
     * Cancelled and note-updated lines are left as-is.
     */
    _splitSingleTicketLines(orderChange) {
        const expandedNewLines = [];

        for (const line of orderChange.new) {
            if (this._shouldSplitLine(line)) {
                const qty = Math.abs(line.quantity);
                for (let i = 0; i < qty; i++) {
                    expandedNewLines.push({
                        ...line,
                        quantity: 1,
                    });
                }
            } else {
                expandedNewLines.push(line);
            }
        }

        return {
            ...orderChange,
            new: expandedNewLines,
        };
    },

    /**
     * Returns true if the line's product belongs to at least one POS category
     * that has x_print_single_ticket enabled AND the quantity is > 1.
     */
    _shouldSplitLine(line) {
        if (!line.quantity || Math.abs(line.quantity) <= 1) {
            return false;
        }

        const product = this.models["product.product"].get(line.product_id);
        if (!product) {
            return false;
        }

        const categories = product.pos_categ_ids || [];
        return categories.some((categ) => categ.x_print_single_ticket);
    },
});
