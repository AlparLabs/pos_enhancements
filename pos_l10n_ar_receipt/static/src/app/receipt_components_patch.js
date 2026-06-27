import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";

// Optional copy label ("ORIGINAL" / "DUPLICADO") threaded from OrderReceipt to
// the header. Declared as a static prop on both components so OWL prop
// validation accepts it; when unset, the header falls back to "ORIGINAL".
const copyLabelProp = { l10nArCopyLabel: { type: String, optional: true } };

OrderReceipt.props = { ...OrderReceipt.props, ...copyLabelProp };
ReceiptHeader.props = { ...ReceiptHeader.props, ...copyLabelProp };
