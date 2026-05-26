/** @odoo-module */

import { BarcodeParser } from "@barcodes/js/barcode_parser";

// Include multi_barcode_separator in the nomenclature data fetched from the server.
BarcodeParser.barcodeNomenclatureFields = [
    ...BarcodeParser.barcodeNomenclatureFields,
    "multi_barcode_separator",
];
