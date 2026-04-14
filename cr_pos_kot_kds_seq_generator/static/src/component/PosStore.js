/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { _t } from "@web/core/l10n/translation";
import { Order, Orderline } from "@point_of_sale/app/store/models";

// Patch the PosStore prototype to handle KOT
patch(PosStore.prototype, {
    async sendOrderInPreparation(order, cancelled = false) {
//        console.log("sendOrderInPreparation called with order:", order);

        const next_seq = await this.orm.call("ir.sequence", "next_by_code", ["pos.kot.number"]);
        const currentTime = await this.orm.call("res.company", "get_company_current_time", []);
        const kotNumber = next_seq + "     " + currentTime;  // Using plain concatenation
        let kotIsSet = false;

        // Loop through each order line to add KOT details
        order.get_orderlines().forEach(orderline => {
            if (!orderline.kot_is_set && !kotIsSet) {
                orderline.kot_note = kotNumber;
                orderline.kot_is_set = true;
                kotIsSet = true;
//                console.log("KOT added to order line:", orderline);
            }
            orderline.kot_is_set_order = true;
            orderline.kot_is_set = true;
//            orderline.kot_len = orderline.kot_len + 1;
        });

        // Continue with original sendOrderInPreparation logic
        let result = await super.sendOrderInPreparation(order, cancelled);

        if (this.preparationDisplayCategoryIds.size) {
            const sendChangesResult = await order.sendChanges(cancelled);
            if (!sendChangesResult && this.synch.status === "connected") {
                await this.popup.add(ErrorPopup, {
                    title: _t("Send failed"),
                    body: _t("Failed to send changes to preparation display"),
                    sound: false,
                });
            }
        }
        return result;

        // Continue with the rest of the sendOrderInPreparation logic
//        return await super.sendOrderInPreparation(order, cancelled);
    },


});

// Patch the Orderline prototype to include reactive properties for KOT
patch(Orderline.prototype, {
    init_from_JSON(json) {
        // Call the original method to ensure all other properties are set up
        super.init_from_JSON(json);

        // Directly assign values from the incoming JSON data
        this.kot_is_set = json.kot_is_set || false; // Default to false if not present
        this.kot_note = json.kot_note || null;      // Default to null if not presen
    },

    // Function to fetch additional KOT details, if needed
    export_as_JSON() {
        const json = super.export_as_JSON();
        json.kot_is_set = this.kot_is_set; // Include KOT properties in JSON export
        json.kot_note = this.kot_note;
        return json;
    }
});


