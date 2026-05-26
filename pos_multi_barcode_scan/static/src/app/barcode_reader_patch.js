/** @odoo-module */

import { BarcodeReader } from "@point_of_sale/app/barcode/barcode_reader_service";
import { patch } from "@web/core/utils/patch";

patch(BarcodeReader.prototype, {
    async _scan(code) {
        const sep = this.parser?.nomenclature?.multi_barcode_separator;
        if (sep && code?.includes(sep)) {
            const cbMaps = this.exclusiveCbMap ? [this.exclusiveCbMap] : [...this.cbMaps];
            for (const part of code.split(sep).map((p) => p.trim()).filter(Boolean)) {
                const parsed = this.parser.parseBarcodeNomenclature(part);
                const cbs = cbMaps.map((cbMap) => cbMap[parsed.type]).filter(Boolean);
                if (cbs.length === 0) {
                    this.showNotFoundNotification(parsed);
                }
                for (const cb of cbs) {
                    await cb(parsed);
                }
            }
            return;
        }
        return super._scan(code);
    },
});
