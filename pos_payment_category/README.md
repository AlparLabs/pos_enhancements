# POS Payment Category - v18.0.1.0.2

Groups payment methods into categories to provide a cleaner and more organized UI on the POS payment screen.

## Overview
As a POS setup grows with multiple terminals, QR code options, and cash variants, the payment screen can become cluttered. This module allows you to bundle related payment methods into parent categories (e.g., "Terminals", "QR Codes", "Digital Wallets"). Cashiers see high-level categories first and can drill down into specific methods with a single tap.

## Key Features
- **Hierarchical Navigation**: Organizes the payment screen into folders (categories) and loose items (uncategorized methods).
- **Smooth Transitions**: Uses OWL's `useState` for instant, local filtering without page reloads.
- **Reporting Integration**: Adds a `category_id` to `pos.payment` records for better financial analysis and grouping.
- **Standard Integration**: Seamlessly integrates with Odoo 18's new `pos.load.mixin` data loading system.

## Configuration

### 1. Define Categories
Go to **Point of Sale > Configuration > Payment Categories** (new menu) and create your categories:
- **Name**: Display name for the category button.
- **Sequence**: Controls the order of display.

### 2. Assign Categories
Go to **Point of Sale > Configuration > Payment Methods** and select a "Payment Category" for the desired methods. Methods left without a category will appear on the top-level screen.

## Technical Details

### Backend (Python)
- **`pos.payment.category`**: A new model inheriting from `pos.load.mixin`. It defines the category structure.
- **`pos.payment.method`**: Inherited to add the `category_id` field and ensure it is loaded into the POS.
- **`pos.payment`**: Inherited to include a related, stored `category_id` for reporting purposes.

### Frontend (JavaScript)
- **`PosPaymentCategory` Model**: Registered in the `pos_available_models` registry to be available as a collection in the POS store.
- **`PaymentScreen` Patch**:
    - **`filteredPaymentMethods`**: A getter that logicallly masks the payment methods. If a category is selected, it shows children; otherwise, it shows top-level categories + uncategorized items.
    - **`clickPaymentCategory`**: Manages the `activePaymentCategory` state.
- **Styling**: Responsive SCSS in `static/src/app/payment_screen.scss` ensures category buttons are visually distinct and fit the POS design language.

## Dependencies
- `point_of_sale`
