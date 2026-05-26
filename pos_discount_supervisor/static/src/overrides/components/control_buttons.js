/* global Sha1 */

/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { NumberPopup } from "@point_of_sale/app/components/popups/number_popup/number_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";

/**
 * Returns true if the current cashier is authorized to apply a discount.
 *
 * In Odoo 18, employee roles are sent to the frontend as `_role` (underscore prefix).
 * An employee becomes a manager if:
 *  - Their linked user belongs to the POS Manager group, OR
 *  - They are listed in the POS config's "Advanced Employees" (advanced_employee_ids)
 * Both cases result in `_role === 'manager'` on the employee object in the POS.
 *
 * If pos_hr is not enabled, or no managers are configured, the action is allowed freely.
 *
 * @param {Object} pos
 * @param {Object} dialog
 * @param {Object} notification
 * @returns {Promise<boolean>}
 */
async function requestSupervisorPin(pos, dialog, notification) {
    // 1. If pos_hr employee login is not enabled for this POS config, allow freely
    if (!pos.config.module_pos_hr) {
        return true;
    }

    // 2. If the current cashier is already a manager, allow freely
    const cashier = pos.get_cashier();
    if (cashier?._role === "manager") {
        return true;
    }

    // 3. Find all manager employees from the POS loaded data
    //    Note: field is `_role` (not `role`) — set server-side in hr_employee._load_pos_data()
    const employees = pos.models["hr.employee"] || [];
    const managers = employees.filter((e) => e._role === "manager");

    // 4. If no managers are configured at all, allow freely (degraded mode)
    if (!managers.length) {
        return true;
    }

    // 5. Prompt for supervisor PIN
    const inputPin = await makeAwaitable(dialog, NumberPopup, {
        formatDisplayedValue: (x) => x.replace(/./g, "•"),
        title: _t("Supervisor PIN Required"),
    });

    if (!inputPin) {
        // User pressed cancel
        return false;
    }

    // _pin is a SHA1 hash of the raw PIN, set server-side
    const hashedPin = Sha1.hash(inputPin);
    const authorized = managers.some((m) => m._pin && m._pin === hashedPin);

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
        this.dialog = useService("dialog");
        this.notification = useService("notification");
    },

    async clickDiscount() {
        const authorized = await requestSupervisorPin(this.pos, this.dialog, this.notification);
        if (!authorized) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        return super.clickDiscount();
    },
});
