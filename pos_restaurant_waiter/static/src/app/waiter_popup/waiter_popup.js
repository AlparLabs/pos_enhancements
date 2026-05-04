/** @odoo-module **/

import { Component, useState, onMounted, useRef } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { _t } from "@web/core/l10n/translation";

/**
 * WaiterPopup — OWL 2 component for selecting the waiter serving a table.
 *
 * Props:
 *   - employees: Array of hr.employee records (already loaded in POS data).
 *   - close: Function to close the dialog.
 *   - getPayload: Function called with the selected employee record (or null if skipped).
 *   - title: Optional string title for the dialog.
 */
export class WaiterPopup extends Component {
    static template = "pos_restaurant_waiter.WaiterPopup";
    static components = { Dialog };
    static props = {
        employees: { type: Array },
        close: { type: Function },
        getPayload: { type: Function },
        title: { type: String, optional: true },
    };

    setup() {
        this.state = useState({
            selectedEmployee: null,
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
        if (!query) {
            return this.props.employees;
        }
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

    confirm() {
        this.props.getPayload(this.state.selectedEmployee);
        this.props.close();
    }

    skip() {
        this.props.getPayload(null);
        this.props.close();
    }
}
