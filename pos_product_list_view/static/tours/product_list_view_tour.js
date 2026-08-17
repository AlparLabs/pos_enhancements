import { registry } from "@web/core/registry";
// Resolvable from web.assets_tests: point_of_sale ships static/src/utils.js into that
// bundle explicitly (point_of_sale/__manifest__.py:98) precisely so tours can read this
// constant. Core's own long-press helper imports it the same way
// (point_of_sale/static/tests/pos/tours/utils/product_screen_util.js:8).
import { LONG_PRESS_DURATION } from "@point_of_sale/utils";
import * as Chrome from "@point_of_sale/../tests/pos/tours/utils/chrome_util";
import * as Dialog from "@point_of_sale/../tests/generic_helpers/dialog_util";
import * as ProductScreen from "@point_of_sale/../tests/pos/tours/utils/product_screen_util";

registry.category("web_tour.tours").add("ProductListViewTour", {
    // Chrome.startPoS() returns an ARRAY (chrome_util.js:121-129) and
    // ProductScreen.selectedOrderlineHas() returns one too — it delegates to
    // inLeftSide() (common.js:9-20), which wraps the steps between two mobile-only
    // steps. Dialog.confirm() (dialog_util.js:3-13) and Chrome.endTour()
    // (chrome_util.js:100-105) return single objects. Hence the outer .flat().
    steps: () =>
        [
            Chrome.startPoS(),
            Dialog.confirm("Open Register"),
            // Regression guard. If the $0 substitution in product_screen.xml ever stops
            // matching, the native grid div is deleted and the literal text "$0" renders
            // instead — with no error thrown. This is the only thing that makes that
            // failure loud. Do not remove it.
            //
            // The anchor is core's own markup: `.rightpane` at
            // point_of_sale/static/src/app/screens/product_screen/product_screen.xml:27,
            // and the `product-list` grid div it contains at :32.
            {
                content: "grid mode still renders the native product container",
                trigger: ".rightpane div.product-list",
            },
            {
                content: "switch the product screen to list view",
                trigger: ".o_pos_view_toggle_btn",
                run: "click",
            },
            {
                content: "the list is rendered with rows",
                trigger: ".o_pos_product_list .o_pos_product_row",
            },
            {
                content: "the price column actually rendered a number",
                trigger: ".o_pos_product_row:contains('Letter Tray') .o_pos_product_row_price",
                // The price is the reason this module exists: the native ProductCard
                // renders no price at all (product_card.xml). It is also the subtlest path
                // in the module — getTaxDetails must receive the pricelist nested under
                // `overridedValues`, or getBaseLine drops it and falls back to raw
                // list_price (product_template_accounting.js:179). A bare trigger would
                // match the empty cell and pass in that broken state, so assert content.
                run() {
                    const text = this.anchor.textContent.trim();
                    if (!/\d/.test(text)) {
                        throw new Error(`Price cell rendered no number: "${text}"`);
                    }
                },
            },
            {
                content: "clicking a row adds the product to the order",
                trigger: ".o_pos_product_row:contains('Letter Tray')",
                run: "click",
            },
            // Asserts through the core helper, so the list has to produce exactly the
            // same orderline the grid would. "Letter Tray" is seeded by
            // TestPointOfSaleHttpCommon (point_of_sale/tests/test_frontend.py:199-205).
            // Signature: selectedOrderlineHas(productName, quantity, price,
            // attributeLine) — product_screen_util.js:612. The quantity is passed as a
            // STRING, as in every core tour: hasLine() normalises it with
            // parseFloat/parseInt before building the `.qty:contains(...)` trigger
            // (generic_helpers/order_widget_util.js:42-45), so "1.0" collapses to "1",
            // which is what the orderline actually renders.
            ProductScreen.selectedOrderlineHas("Letter Tray", "1.0"),
            {
                content: "long-press a row opens the product info popup",
                trigger: ".o_pos_product_row:contains('Letter Tray')",
                // There is no press_and_hold run action. run() is invoked as
                // run.call({ anchor: this.element }, helpers) —
                // web_tour/static/src/js/tour_automatic/tour_step_automatic.js:109.
                // Synthetic mousedown/mouseup do not synthesize a click, so this does not
                // add the product a second time. Same technique as core's
                // ProductScreen.longPressProduct (product_screen_util.js:980-994), which
                // cannot be reused here because its trigger is grid-specific
                // (`.product-list .product-name`).
                //
                // useLongPress only starts the timer when event.button === 0
                // (point_of_sale/static/src/app/hooks/long_press_hook.js:20-23); the
                // MouseEvent default is already 0 but it is stated explicitly. The
                // trailing mouseup lands after the timer fired, so cancelLongPress is a
                // no-op and pos.onProductInfoClick has already run
                // (pos_store.js:755-758).
                async run() {
                    this.anchor.dispatchEvent(
                        new MouseEvent("mousedown", { button: 0, bubbles: true })
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, LONG_PRESS_DURATION + 200)
                    );
                    this.anchor.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                },
            },
            {
                content: "the product info popup is shown",
                // ProductInfoPopup renders `<Dialog contentClass="'product-info-popup'">`
                // (point_of_sale/static/src/app/components/popups/product_info_popup/product_info_popup.xml:4)
                // and web.Dialog puts contentClass on `.modal-content`, inside
                // `div.modal` (web/static/src/core/dialog/dialog.xml:6 and :12).
                // NOT `.product-info` — a class selector matches whole tokens, so
                // `.product-info` would never match `product-info-popup`.
                trigger: ".modal .product-info-popup",
            },
            Chrome.endTour(),
        ].flat(),
});
