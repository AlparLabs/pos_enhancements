import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

/**
 * Keep the POS screensaver, drop the implicit logout that comes with it.
 *
 * Core flow (point_of_sale/static/src/app/pos_app.js, useIdleTimer):
 *   - after `PosStore.idleTimeout` elapses the register navigates to
 *     "SaverScreen" (and, with pos_restaurant, back to "FloorScreen" first);
 *   - on the next user event the handler calls `navigateToFirstPage()`, whose
 *     `firstPage` getter calls `resetCashier()` whenever the page was not
 *     opened through the backend redirect. The cashier is wiped and the user
 *     lands on the LoginScreen - i.e. the employee PIN prompt when pos_hr is
 *     installed.
 *
 * The overrides below leave the screensaver alone and only neutralise that
 * hidden logout. Explicit logouts (`showLoginScreen()`, `closePos()`) keep
 * working, since they call `resetCashier()` outside of `firstPage`.
 */
patch(PosStore.prototype, {
    async setup() {
        // Page the register was showing right before the screensaver kicked in.
        this.pageBeforeSaverScreen = null;
        // Guard set while `firstPage` runs, see `resetCashier` below.
        this.skipCashierReset = false;
        await super.setup(...arguments);
    },

    /**
     * @override
     * Remember the current page when the idle timer hands over to the
     * screensaver, so we can come back to it instead of `defaultPage`.
     */
    navigate(routeName, routeParams = {}) {
        if (routeName === "SaverScreen" && this.router.state.current !== "SaverScreen") {
            this.pageBeforeSaverScreen = {
                page: this.router.state.current,
                params: { ...this.router.state.params },
            };
        }
        return super.navigate(...arguments);
    },

    /**
     * @override
     * Called by the idle timer when the user comes back. Resume where the
     * register was as long as somebody is still logged in; otherwise fall back
     * to the core behaviour (which lands on the LoginScreen).
     */
    navigateToFirstPage() {
        const resumePage = this.pageBeforeSaverScreen;
        this.pageBeforeSaverScreen = null;

        if (this.cashier && resumePage && resumePage.page !== "SaverScreen") {
            this.navigate(resumePage.page, resumePage.params);
            return;
        }
        return super.navigateToFirstPage(...arguments);
    },

    /**
     * @override
     * Flag the `resetCashier()` call that core hides inside this getter. The
     * getter is synchronous, so the guard cannot leak to any other caller.
     */
    get firstPage() {
        this.skipCashierReset = true;
        try {
            return super.firstPage;
        } finally {
            this.skipCashierReset = false;
        }
    },

    /**
     * @override
     * Ignore the reset triggered from `firstPage`, honour every other one.
     */
    resetCashier() {
        if (this.skipCashierReset) {
            return;
        }
        return super.resetCashier(...arguments);
    },
});
