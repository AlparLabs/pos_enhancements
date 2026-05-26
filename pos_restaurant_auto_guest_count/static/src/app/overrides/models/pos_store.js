import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { NumberPopup } from "@point_of_sale/app/components/popups/number_popup/number_popup";
import { _t } from "@web/core/l10n/translation";

patch(PosStore.prototype, {
    /**
     * @override
     * @param {Object} table
     * @param {string|null} orderUuid
     * @returns {Promise<any>}
     */
    async setTableFromUi(table, orderUuid = null) {
        await super.setTableFromUi(...arguments);
        if (this.config.module_pos_restaurant) {
            const order = this.getOrder();
            // Prompt for guest count if the order is new (no lines) and hasn't been finalized.
            // Odoo 18 defaults guest count to 1, but we want to confirm it.
            if (order && order.lines.length === 0 && !order.finalized) {
                this.askCustomerCount(order);
            }
        }
    },
    /**
     * Shows the guest count popup.
     * @param {Object} order
     */
    askCustomerCount(order) {
        this.dialog.add(NumberPopup, {
            startingValue: order.getCustomerCount() || 0,
            title: _t("Guests?"),
            feedback: (buffer) => {
                const value = this.env.utils.formatCurrency(
                    order.amountPerGuest(parseInt(buffer, 10) || 0) || 0
                );
                return value ? `${value} / ${_t("Guest")}` : "";
            },
            getPayload: (inputNumber) => {
                const guestCount = parseInt(inputNumber, 10) || 0;
                order.setCustomerCount(guestCount);
                if (typeof order.id === "number") {
                    this.addPendingOrder([order.id]);
                }
            },
        });
    }
});
