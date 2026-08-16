import { PosStore } from "@point_of_sale/app/services/pos_store";
import { patch } from "@web/core/utils/patch";
import {
    GRID,
    LIST,
    readStoredMode,
    resolveInitialMode,
    storeMode,
} from "@pos_product_list_view/app/view_mode";

patch(PosStore.prototype, {
    async setup() {
        await super.setup(...arguments);
        // PosStore is reactive (core mutates pos.scanning from templates the same way),
        // so assigning this property re-renders the product screen.
        this.productListViewMode = resolveInitialMode(
            readStoredMode(window.localStorage),
            this.config.product_view_default
        );
    },

    get isProductListView() {
        return this.productListViewMode === LIST;
    },

    toggleProductListView() {
        this.productListViewMode = this.isProductListView ? GRID : LIST;
        storeMode(window.localStorage, this.productListViewMode);
    },
});
