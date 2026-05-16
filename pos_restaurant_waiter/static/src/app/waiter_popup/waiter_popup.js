/** @odoo-module **/

import { Component, useState, onMounted, useRef } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

const AVATAR_COLORS = [
    "#4f6bed", "#f4a41b", "#22c55e", "#e84393",
    "#8b5cf6", "#06b6d4", "#ef4444", "#f97316",
    "#84cc16", "#6366f1",
];

export class WaiterPopup extends Component {
    static template = "pos_restaurant_waiter.WaiterPopup";
    static components = { Dialog };
    static props = {
        employees:     { type: Array },
        close:         { type: Function },
        getPayload:    { type: Function },
        title:         { type: String, optional: true },
        currentWaiter: { optional: true },
    };

    setup() {
        this.state = useState({
            selectedEmployee: this.props.currentWaiter || null,
            searchQuery: "",
        });
        this.searchRef = useRef("search");

        onMounted(() => {
            this.searchRef.el?.focus();
        });
    }

    get title() {
        return this.props.title || _t("Who is serving this table?");
    }

    get labelSearch() { return _t("Search waiter..."); }
    get labelCurrentlyAssigned() { return _t("Currently assigned"); }
    get labelNoWaiters() { return _t("No waiters found"); }
    get labelAssignWaiter() { return _t("Assign Waiter"); }
    get labelSkip() { return _t("Skip"); }
    get labelConfirm() { return _t("Confirm"); }

    get filteredEmployees() {
        const query = this.state.searchQuery.toLowerCase().trim();
        if (!query) return this.props.employees;
        return this.props.employees.filter((e) =>
            e.name.toLowerCase().includes(query)
        );
    }

    selectEmployee(employee) {
        this.state.selectedEmployee = employee;
    }

    isSelected(employee) {
        return this.state.selectedEmployee?.id === employee.id;
    }

    getInitials(name) {
        if (!name) return "?";
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    getAvatarColor(employee) {
        return AVATAR_COLORS[employee.id % AVATAR_COLORS.length];
    }

    confirm() {
        this.props.getPayload(this.state.selectedEmployee);
        this.props.close();
    }

    skip() {
        this.props.getPayload(null);
        this.props.close();
    }
}
