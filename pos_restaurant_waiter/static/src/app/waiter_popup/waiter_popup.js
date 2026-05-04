/** @odoo-module **/

import { Component, useState, onMounted, useRef } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

// Consistent avatar colors — cycles through this palette by employee ID
const AVATAR_COLORS = [
    "#4f6bed", "#f4a41b", "#22c55e", "#e84393",
    "#8b5cf6", "#06b6d4", "#ef4444", "#f97316",
    "#84cc16", "#6366f1",
];

/**
 * WaiterPopup — OWL 2 component for selecting/changing the waiter serving a table.
 *
 * Props:
 *   - employees:     Array of hr.employee records loaded in POS.
 *   - close:         Function to close the dialog.
 *   - getPayload:    Called with the selected employee (or null if cleared, undefined if cancelled).
 *   - title:         Optional dialog title string.
 *   - currentWaiter: Optional currently assigned hr.employee record.
 */
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

    /**
     * Returns 1-2 uppercase initials from the employee's name.
     */
    getInitials(name) {
        if (!name) return "?";
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    /**
     * Returns a deterministic color from AVATAR_COLORS based on the employee ID.
     */
    getAvatarColor(employee) {
        return AVATAR_COLORS[employee.id % AVATAR_COLORS.length];
    }

    confirm() {
        this.props.getPayload(this.state.selectedEmployee);
        this.props.close();
    }

    /**
     * Skip — passes null so the caller knows the user explicitly chose not to assign.
     */
    skip() {
        this.props.getPayload(null);
        this.props.close();
    }
}
