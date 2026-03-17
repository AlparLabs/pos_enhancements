# POS Retail Pre-Ticket - v18.0.1.0.0

Adds a "Print Pre-Ticket" button to the standard retail Point of Sale interface.

## Overview
In many retail environments (like hardware stores), a salesperson prepares an order and the customer takes a draft ticket to a central cashier for payment. Normally, this "Pre-Ticket" or "Bill" functionality is exclusive to Odoo's `pos_restaurant` module. 

This module extracts that functionality and makes it available in the **standard retail POS**, allowing for a cleaner setup without the unnecessary weight of table management and floor plans.

## Key Features
- **Print Pre-Ticket Button**: Adds a dedicated button to the POS control panel.
- **Draft Receipt**: Generates a professional receipt with a barcode, based on the current order state.
- **Retail Optimization**: Designed specifically for retail workflows where the `pos_restaurant` module is not desired.
- **Odoo 18 Ready**: Uses the latest OWL component structure and POS printer service.

## Technical Details

### Frontend (JavaScript)
- **`PreTicketButton`**: An OWL component that inherits from `Component` and is injected into `ControlButtons`.
- **`PreTicketReceipt`**: A custom receipt component that uses standard POS sub-components like `ReceiptHeader` and `Orderline`.
- **Printing Logic**: Uses `this.pos.getReceiptHeaderData(order)` and `order.export_for_printing()` to ensure the draft ticket matches the final receipt's data structure.

### Assets
- **Templates**: Located in `static/src/app/control_buttons/pre_ticket_button.xml` and `static/src/app/receipt/pre_ticket_receipt.xml`.

## Dependencies
- `point_of_sale`
