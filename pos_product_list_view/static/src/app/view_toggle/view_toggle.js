import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

export class ProductViewToggle extends Component {
    static template = "pos_product_list_view.ProductViewToggle";
    static props = {};

    setup() {
        this.pos = usePos();
    }

    get label() {
        return this.pos.isProductListView ? _t("Switch to grid view") : _t("Switch to list view");
    }

    get icon() {
        return this.pos.isProductListView ? "fa-th-large" : "fa-list";
    }
}
