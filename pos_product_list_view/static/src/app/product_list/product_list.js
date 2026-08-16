import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { ProductRow } from "@pos_product_list_view/app/product_row/product_row";

const UNCATEGORIZED = "0";

export class ProductList extends Component {
    static template = "pos_product_list_view.ProductList";
    static components = { ProductRow };
    static props = {
        // ProductScreen.addProductToOrder — takes a product.template, not a variant.
        onProductClick: Function,
        // ProductScreen.getProductName
        getProductName: Function,
        // ProductScreen.longPressHandlers. Passed down rather than recreated with
        // useLongPress: the scroll container cancels long-press through THIS object,
        // so a second instance would keep firing the popup while the cashier scrolls.
        longPressHandlers: Object,
        quantityByProductTmplId: Object,
    };

    setup() {
        this.pos = usePos();
    }

    get config() {
        return this.pos.config;
    }

    getCategoryName(categId) {
        // "0" is a sentinel core pushes for products with no category, mixed in with
        // real numeric ids (pos_store.js:2956-2958). Looking it up would return nothing
        // and the group would render with a blank header.
        if (categId === UNCATEGORIZED) {
            return _t("Without category");
        }
        return this.pos.models["pos.category"].get(categId)?.name || "";
    }
}
