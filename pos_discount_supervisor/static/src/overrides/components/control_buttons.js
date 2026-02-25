/* global Sha1 */

/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

/**
 * Returns true if a supervisor PIN is needed and validates it.
 * 
 * "Manager" is defined by the `role` field on the hr.employee record in POS.
 * To configure:
 *  - Open Employees → find the employee → Point of Sale tab → set "Point of Sale Role" to "Manager"
 *  - That employee must also have a PIN set in their employee profile
 *
 * If pos_hr is not enabled on this POS, or if the current cashier is already
 * a manager, or if no manager employees exist, the action is allowed freely.
 */
async function requestSupervisorPin(pos, dialog, notification) {
    // 1. If pos_hr employee login is not enabled, skip check
    if (!pos.config.module_pos_hr) {
        return true;
    }

    // 2. If the current cashier is already a manager, skip check
    const cashier = pos.get_cashier();
    if (cashier?.role === "manager") {
        return true;
    }

    // 3. Find manager employees from the loaded POS data
    const employees = pos.models["hr.employee"] || [];
    const managers = employees.filter((e) => e.role === "manager");

    // 4. If no managers are configured, allow freely (nothing to validate against)
    if (!managers.length) {
        return true;
    }

    // 5. Prompt for supervisor PIN
    const inputPin = await makeAwaitable(dialog, NumberPopup, {
        formatDisplayedValue: (x) => x.replace(/./g, "•"),
        title: _t("Supervisor PIN Required"),
    });

    if (!inputPin) {
        // User cancelled
        return false;
    }

    const hashedPin = Sha1.hash(inputPin);
    const authorized = managers.some((manager) => manager._pin && manager._pin === hashedPin);

    if (!authorized) {
        notification.add(_t("Incorrect PIN. Discount not authorized."), {
            type: "warning",
            title: _t("Access Denied"),
        });
        return false;
    }
    return true;
}

patch(ControlButtons.prototype, {
    setup() {
        super.setup(...arguments);
        this.notification = useService("notification");
    },

    async clickDiscount() {
        const authorized = await requestSupervisorPin(this.pos, this.dialog, this.notification);
        if (!authorized) {
            return;
        }
        return super.clickDiscount(...arguments);
    },
});
