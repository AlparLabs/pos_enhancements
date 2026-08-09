from typing import Any
from odoo import fields, models


class BarcodeNomenclature(models.Model):
    _inherit = 'barcode.nomenclature'

    multi_barcode_separator = fields.Char(
        string="Multi-Barcode Separator",
        default='|',
        help="Character used to split a single QR code containing multiple barcodes "
             "(e.g. client barcode and coupon). Leave empty to disable.",
    )

    def parse_barcode(self, barcode: str) -> Any:
        sep = self.multi_barcode_separator
        if sep and sep in barcode and not barcode.startswith('urn:'):
            return [
                self.parse_nomenclature_barcode(part.strip())
                for part in barcode.split(sep)
                if part.strip()
            ]
        return super().parse_barcode(barcode)
