import { patch } from "@web/core/utils/patch";
import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";

// Optional copy label ("ORIGINAL" / "DUPLICADO") threaded from OrderReceipt to
// the header. Declared as a static prop on both components so OWL prop
// validation accepts it; when unset, the header falls back to "ORIGINAL".
const copyLabelProp = { l10nArCopyLabel: { type: String, optional: true } };

OrderReceipt.props = { ...OrderReceipt.props, ...copyLabelProp };
ReceiptHeader.props = { ...ReceiptHeader.props, ...copyLabelProp };

patch(ReceiptHeader.prototype, {
    get isSupermarketReceipt() {
        const order = this.props.order || this.order || (this.pos && this.pos.get_order ? this.pos.get_order() : null);
        return order?.config?.l10n_ar_receipt_style === "supermarket";
    },

    get supermarketHeaderData() {
        const order = this.props.order || this.order || (this.pos && this.pos.get_order ? this.pos.get_order() : null);
        if (!order) {
            return {
                pv: "",
                ticketNum: "",
                dateStr: "",
                timeStr: "",
                caja: "",
                cajero: "",
                docType: "FACTURA B",
                docCode: "006",
                partnerResp: "A CONSUMIDOR FINAL",
            };
        }

        const docNum = order.l10n_latam_document_number || "";
        let pv = "";
        let ticketNum = "";
        if (docNum.includes("-")) {
            const parts = docNum.split("-");
            pv = parts[0].trim();
            ticketNum = parts[1].trim();
        } else {
            pv = order.config?.name || "";
            ticketNum = order.tracking_number || order.pos_reference || docNum;
        }

        const dateVal = order.date_order ? new Date(order.date_order) : new Date();
        const day = String(dateVal.getDate()).padStart(2, "0");
        const month = String(dateVal.getMonth() + 1).padStart(2, "0");
        const year = String(dateVal.getFullYear()).slice(-2);
        const hours = String(dateVal.getHours()).padStart(2, "0");
        const minutes = String(dateVal.getMinutes()).padStart(2, "0");
        const seconds = String(dateVal.getSeconds()).padStart(2, "0");

        return {
            pv,
            ticketNum,
            dateStr: `${day}/${month}/${year}`,
            timeStr: `${hours}:${minutes}:${seconds}`,
            caja: (order.config?.id ? String(order.config.id).padStart(4, "0") : "") || order.config?.name || "",
            cajero: order.cashier?.name || order.user_id?.name || "",
            docType: order.l10n_ar_document_type_name || "FACTURA B",
            docCode: order.l10n_ar_document_type_code || "006",
            partnerResp: order.partner_id?.l10n_ar_afip_responsibility_type_id?.name || "A CONSUMIDOR FINAL",
        };
    },
});

// OWL templates can't call JS globals like encodeURIComponent (identifiers
// resolve against the component instance only), so the ARCA QR src has to be
// built here and exposed as a component method for the template to call.
patch(OrderReceipt.prototype, {
    get isSupermarketReceipt() {
        const order = this.props.order || this.order || (this.pos && this.pos.get_order ? this.pos.get_order() : null);
        return order?.config?.l10n_ar_receipt_style === "supermarket";
    },

    get supermarketData() {
        const order = this.props.order || this.order || (this.pos && this.pos.get_order ? this.pos.get_order() : null);
        if (!order) {
            return {
                groups: [],
                discounts: [],
                subtotalWithoutDiscountsStr: "0.00",
                totalSavingsStr: "0.00",
                hasDiscounts: false,
            };
        }

        const lines = order.lines || [];
        const groupsMap = new Map();
        const discounts = [];
        let subtotalWithoutDiscounts = 0;

        for (const line of lines) {
            if (line.combo_parent_id && !line.price_subtotal_incl) {
                continue;
            }

            const product = line.product_id;
            const lineNet = line.price_subtotal_incl !== undefined ? line.price_subtotal_incl : (line.price_subtotal || 0);

            // Negative lines are discount/promotions (e.g. 15%dto-Mercado Pago, loyalty reward)
            if (lineNet < 0) {
                discounts.push({
                    name: line.get_product_name?.() || product?.display_name || "Descuento",
                    amount: Math.abs(lineNet),
                    amountStr: Math.abs(lineNet).toFixed(2),
                });
                continue;
            }

            const qty = line.qty !== undefined ? line.qty : 1;
            const priceUnit = line.price_unit !== undefined ? line.price_unit : 0;
            const lineGross = qty * priceUnit;
            subtotalWithoutDiscounts += lineGross;

            let lineDiscountAmount = 0;
            let lineDiscountStr = "";
            let lineDiscountName = "";
            if (line.discount && line.discount > 0) {
                lineDiscountAmount = lineGross * (line.discount / 100);
                lineDiscountStr = lineDiscountAmount.toFixed(2);
                lineDiscountName = `Desc. (${line.discount}%)`;
                discounts.push({
                    name: `${line.get_product_name?.() || product?.display_name || "Producto"} (${line.discount}%)`,
                    amount: lineDiscountAmount,
                    amountStr: lineDiscountStr,
                });
            }

            const posCateg = product?.pos_categ_ids?.[0];
            const categName = posCateg?.name || product?.categ_id?.name || "Otros";
            const categKey = posCateg?.id ? `pos_${posCateg.id}` : (product?.categ_id?.id ? `prod_${product.categ_id.id}` : categName);
            const sequence = typeof posCateg?.sequence === "number" ? posCateg.sequence : 100;

            if (!groupsMap.has(categKey)) {
                groupsMap.set(categKey, {
                    name: categName,
                    sequence,
                    lines: [],
                });
            }

            let taxRate = 21.0;
            if (line.tax_ids && line.tax_ids.length > 0) {
                taxRate = line.tax_ids.reduce((acc, t) => acc + (t.amount || 0), 0);
            } else if (product?.taxes_id && product.taxes_id.length > 0) {
                taxRate = product.taxes_id.reduce((acc, t) => acc + (t.amount || 0), 0);
            }

            const barcode = product?.barcode || product?.default_code || "";

            groupsMap.get(categKey).lines.push({
                line,
                name: (line.get_product_name?.() || product?.display_name || product?.name || "").toUpperCase(),
                qtyStr: qty % 1 === 0 ? String(qty) : qty.toFixed(2),
                unitPriceStr: priceUnit.toFixed(2),
                taxRateStr: `${taxRate.toFixed(2)}%`,
                subtotalStr: lineGross.toFixed(2),
                hasDiscount: lineDiscountAmount > 0,
                discountName: lineDiscountName,
                discountStr: lineDiscountStr,
                barcode,
            });
        }

        const groups = Array.from(groupsMap.values()).sort((a, b) => a.sequence - b.sequence);
        const totalSavings = discounts.reduce((acc, d) => acc + d.amount, 0);

        return {
            groups,
            discounts,
            subtotalWithoutDiscounts,
            subtotalWithoutDiscountsStr: subtotalWithoutDiscounts.toFixed(2),
            totalSavings,
            totalSavingsStr: totalSavings.toFixed(2),
            hasDiscounts: discounts.length > 0,
        };
    },

    get supermarketTotalStr() {
        const order = this.props.order || this.order || (this.pos && this.pos.get_order ? this.pos.get_order() : null);
        const total = order?.priceIncl !== undefined ? order.priceIncl : (order?.get_total_with_tax?.() || 0);
        return total.toFixed(2);
    },

    l10nArQrCodeSrc(qrCode) {
        return `/report/barcode/?barcode_type=QR&width=200&height=200&value=${encodeURIComponent(qrCode)}`;
    },
});
