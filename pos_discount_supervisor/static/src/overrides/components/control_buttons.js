/* global Sha1 */

/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

patch(ControlButtons.prototype, {
    setup() {
        super.setup(...arguments);
        this.notification = useService("notification");
    },

    async _requestSupervisorPin() {
        // If pos_hr is not active, allow directly (no employee-based access control)
        if (!this.pos.config.module_pos_hr) {
            return true;
        }
        // If current cashier is already a manager, allow directly
        const cashier = this.pos.get_cashier();
        if (cashier?.role === "manager") {
            return true;
        }

        // Find all manager employees
        const managers = (this.pos.models["hr.employee"] || []).filter(
            (e) => e.role === "manager"
        );

        if (!managers.length) {
            this.notification.add(_t("No manager configured to authorize discounts."), {
                type: "warning",
            });
            return false;
        }

        // Ask for PIN
        const inputPin = await makeAwaitable(this.dialog, NumberPopup, {
            formatDisplayedValue: (x) => x.replace(/./g, "•"),
            title: _t("Manager PIN required"),
        });

        if (!inputPin) {
            return false;
        }

        const hashedPin = Sha1.hash(inputPin);
        const authorized = managers.some((manager) => manager._pin === hashedPin);
        if (!authorized) {
            this.notification.add(_t("Incorrect PIN. Discount not authorized."), {
                type: "warning",
                title: _t("Access Denied"),
            });
            return false;
        }
        return true;
    },

    async clickDiscount() {
        const authorized = await this._requestSupervisorPin();
        if (!authorized) {
            return;
        }
        return super.clickDiscount(...arguments);
    },
});
