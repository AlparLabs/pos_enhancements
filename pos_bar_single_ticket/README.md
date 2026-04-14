# POS Bar Single Ticket - v18.0.1.0.0

Generates individual kitchen/bar tickets for each unit of selected products, ideal for bar service (e.g., one ticket per drink).

## Overview
In busy bar or kitchen environments, a single ticket showing "3 Mojitos" can be harder to process than three separate tickets for "1 Mojito" each—especially if different bartenders handle individual drinks. This module adds a configuration to POS Categories that forces the "Bar Ticket" printer to split quantities into separate, individual print jobs.

## Key Features
- **Quantity Splitting**: Turns a single order line of Qty N into N separate tickets of Qty 1.
- **Category-Based Control**: Toggle this behavior on/off at the POS Category level.
- **Dedicated Bar Button**: Adds a "Print Bar Tickets" button to the POS interface.
- **Unit-Level Accuracy**: Each ticket represents exactly one unit of the product.

## Configuration

### 1. Enable Single Tickets
Go to **Point of Sale > Configuration > POS Product Categories** and edit a category:
- **Print Single Ticket**: Check this box. 
- *Note*: Any product belonging to this category will now be split during bar printing.

### 2. Printer Setup
Ensure you have a kitchen/bar printer configured in your POS settings.

## Technical Details

### Backend (Python)
- **`pos.category`**: Inherited to add `x_print_single_ticket` (Boolean). This field is added to the POS data load via `_load_pos_data_fields`.

### Frontend (JavaScript)
- **`BarTicketButton`**: An OWL component injected into `ControlButtons`.
    - **`click()` Logic**: 
        1. Iterates through all order lines.
        2. Checks if the product's category has `x_print_single_ticket` enabled.
        3. If true, it isolates the line and fires `this.printer.print()` N times (where N is the quantity).
- **`BarTicketReceipt`**: A specialized receipt template that shows the single unit and hides financial totals (since it's for the bar/kitchen).

## Dependencies
- `point_of_sale`
- `pos_restaurant`
