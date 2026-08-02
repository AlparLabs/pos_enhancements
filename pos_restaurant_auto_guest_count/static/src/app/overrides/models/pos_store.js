import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    /**
     * @override
     * Prompt for the guest count right after a table is opened with a fresh
     * (empty, non-finalized) order. Reuses the core pos_restaurant popup
     * (PosStore.setCustomerCount), which handles the amount-per-guest
     * feedback and syncs the order via addPendingOrder.
     *
     * The core only asks for guests on its own when presets with `use_guest`
     * are enabled (see ensureGuestCustomerCount); without presets it silently
     * defaults the count to the table's seats, which is what this overrides.
     */
    async setTableFromUi(table, orderUuid = null) {
        await super.setTableFromUi(...arguments);
        if (!this.config.module_pos_restaurant) {
            return;
        }
        const order = this.getOrder();
        if (order && order.lines.length === 0 && !order.finalized) {
            // removeEmptyOrder=false: cancelling the popup keeps the order,
            // the count simply stays at the table's default seat count.
            await this.setCustomerCount(order, false);
            // Prevent ensureGuestCustomerCount() from asking a second time
            // when presets with guest tracking are enabled.
            order.uiState.guestSetted = true;
        }
    },
});
