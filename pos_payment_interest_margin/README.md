# POS Payment Interest Margin - v18.0.1.0.0

Automatically adds an interest surcharge (as an order line) when specific payment methods are selected in the POS.

## Overview
Many retailers need to pass along financial credit card costs or financing fees to the customer depending on the payment method used. This module automates that process. If a payment method is configured with an "Interest Margin (%)", the POS will automatically calculate the fee based on the current balance due and add it as a new line to the order using a specialized service product.

## Key Features
- **Automated Surcharging**: Logic is triggered exactly when the payment method is selected.
- **Dynamic Calculation**: Fees are calculated against the *remaining balance due*, supporting partial payments with different methods.
- **Auto-Cleanup**: If a payment line is deleted, the corresponding surcharge line is automatically removed from the order to maintain data integrity.
- **Flexible Configuration**: Per-method surcharges and custom interest products.

## Configuration

### 1. Configure Interest Product
Create a product (e.g., "Interest Fee") with:
- **Product Type**: Service
- **Sales Price**: 0.00 (it will be set dynamically)
- **Taxes**: Configure as needed (usually matches the main items or is tax-exempt).

### 2. Set Margin on Payment Methods
Go to **Point of Sale > Configuration > Payment Methods**:
- **Interest Margin (%)**: Enter the surcharge percentage (e.g., 5.0 for 5%).
- **Interest Product**: Select the service product created in step 1.

## Technical Details

### Backend (Python)
- **`pos.payment.method`**: Added `interest_margin_pct` (Float) and `interest_product_id` (Many2one).
- **Data Loading**: These fields are automatically loaded into the POS assets via base Odoo 18 mechanisms.

### Frontend (JavaScript)
- **`PaymentScreen` Patch**:
    - **`addNewPaymentLine`**: Intercepts the payment request. If the method has a margin, it uses `order.add_product()` to inject the surcharge line *before* the payment line is generated.
    - **`deletePaymentLine`**: Scans the order lines for the `interest_product_id` and removes them when the associated payment is cancelled.

## Dependencies
- `point_of_sale`
