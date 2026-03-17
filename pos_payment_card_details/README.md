# POS Payment Card Details - v18.0.1.0.0

Enables tracking of physical terminal payment details (Lot Number, Coupon, Installments) directly in the POS for easier banking conciliation.

## Overview
When using standalone payment terminals (non-integrated), accountants often struggle to match POS payments with bank statements because critical tracking numbers from the terminal's paper receipt are missing in Odoo. This module solves this by prompting the cashier to enter the Lot Number, Coupon Number, and Number of Installments immediately after a card payment is initiated.

## Key Features
- **Mandatory Detail Capture**: A popup appears automatically when specific payment methods are selected.
- **Improved Conciliation**: Stores lot and coupon numbers on the `pos.payment` record for backend reporting.
- **Installment Tracking**: Specifically tracks the number of installments (cuotas) for financing analysis.
- **Backend Visibility**: Adds columns to the POS Payments list and form views.

## Configuration

### 1. Enable Terminal Details
Go to **Point of Sale > Configuration > Payment Methods** and edit a card-based method:
- **Use Terminal Details**: Check this box to enable the popup for this method.

### 2. Permissions
Ensure POS managers can see the new fields in the Backend `pos.payment` view for audit purposes.

## Technical Details

### Backend (Python)
- **`pos.payment`**: Inherited to add `lot_number`, `coupon_number`, and `installments`.
- **`pos.order`**: Inherited to ensure these fields are correctly exported to the session's data.

### Frontend (JavaScript)
- **`TerminalDetailsPopup`**: A new OWL dialog that captures the three fields using Odoo's `useState` hook.
- **`PaymentScreen` Patch**:
    - **`addNewPaymentLine`**: Intercepts the payment. It uses `makeAwaitable` to suspend the process, shows the popup, and only continues with the standard logic (via `super`) if the user confirms. The captured payload is then manually injected into the `selected_paymentline`.
- **Receipt Extension**: Modifies the POS receipt to include the lot and coupon number (optional view inheritance).

## Dependencies
- `point_of_sale`
