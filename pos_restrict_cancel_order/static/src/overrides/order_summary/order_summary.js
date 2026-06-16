/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";

function isManagerCashier(pos) {
    if (!pos.config.module_pos_hr) {
        return true;
    }
    return pos.get_cashier()?._role === "manager";
}

patch(OrderSummary.prototype, {
    setup() {
        super.setup(...arguments);
        this.notification = useService("notification");
        this.orm = useService("orm");
    },

    /**
     * Single chokepoint for every numpad-driven quantity change. Both the
     * standard path (-> _setValue) and the restaurant "decrease popup" path
     * (when disallowLineQuantityChange() is true) start here, so blocking here
     * covers line removal AND quantity reduction for non-manager cashiers.
     *
     * Adding products and raising quantities is always allowed; only removing a
     * line or lowering its quantity is gated. Managers are unaffected, and when
     * a manager removes/reduces a line on a synced order an audit note is posted
     * to the order chatter.
     */
    async updateSelectedOrderline(input) {
        const order = this.pos.get_order();
        const line = order?.get_selected_orderline();
        const isQty = this.pos.numpadMode === "quantity";

        // Snapshot before the operation so we can detect a reduction/removal and
        // build the audit description from the still-existing line.
        const before =
            line && isQty
                ? {
                      uuid: line.uuid,
                      name: line.get_full_product_name?.() ?? line.product_id?.display_name ?? "",
                      qty: line.get_quantity(),
                  }
                : null;

        if (before) {
            // Backspace empties the buffer to null -> core treats it as "remove".
            const removing = input?.buffer === null;
            let parsed = NaN;
            if (!removing && input?.buffer) {
                // Locale-aware parser throws on partial/invalid input ("-", "").
                try {
                    parsed = parseFloat(input.buffer);
                } catch {
                    parsed = NaN;
                }
            }
            const decreasing =
                !removing && !Number.isNaN(parsed) && Math.abs(parsed) < before.qty;

            // Hard block for waiters (non-managers).
            if ((removing || decreasing) && !isManagerCashier(this.pos)) {
                this.numberBuffer.reset();
                this.notification.add(
                    _t("Solo un administrador puede eliminar o reducir ítems del pedido."),
                    { type: "warning", title: _t("Acción no permitida") }
                );
                return;
            }
        }

        const result = await super.updateSelectedOrderline(input);

        // Audit: a manager just removed or reduced a line on a synced order.
        if (before && typeof order.id === "number") {
            const stillExists = this.pos.models["pos.order.line"].getBy("uuid", before.uuid);
            const afterQty = stillExists ? stillExists.get_quantity() : 0;
            const employeeId = this.pos.get_cashier()?.id ?? null;
            if (afterQty < before.qty && employeeId) {
                const description = `${before.name}: ${before.qty} → ${afterQty}`;
                this.orm
                    .call("pos.order", "log_orderline_removal", [order.id, employeeId, description])
                    .catch(() => {});
            }
        }

        return result;
    },
});
