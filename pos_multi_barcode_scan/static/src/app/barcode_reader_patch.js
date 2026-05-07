/** @odoo-module */

import { BarcodeReader } from "@point_of_sale/app/barcode/barcode_reader_service";
import { patch } from "@web/core/utils/patch";

patch(BarcodeReader.prototype, {
    scan(barcode) {
        // Handle QR code containing multiple barcodes separated by a pipe '|'
        // Format: "CLIENT_BARCODE|COUPON_BARCODE"
        if (typeof barcode === 'string' && barcode.includes('|')) {
            console.log("[POS Multi Barcode Scan] Detected multi-barcode QR:", barcode);
            const parts = barcode.split('|');
            
            // We scan them sequentially.
            // Odoo's barcode parser handles client barcodes and coupon barcodes directly.
            for (const part of parts) {
                const trimmedPart = part.trim();
                if (trimmedPart) {
                    console.log(`[POS Multi Barcode Scan] Scanning component: ${trimmedPart}`);
                    super.scan(trimmedPart);
                }
            }
            return;
        }

        // Call original method for normal single barcodes
        return super.scan(barcode);
    }
});
