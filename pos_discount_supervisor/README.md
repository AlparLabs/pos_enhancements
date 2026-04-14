# POS Discount Supervisor Clearance - v18.0.1.0.0

Restricts the ability to apply discounts in the POS to authorized supervisors and managers only.

## Overview
To prevent unauthorized price adjustments, this module overrides the standard discount behavior in Odoo's Point of Sale. When a regular cashier attempts to apply either a line discount (via numpad) or a global discount (via action button), the system will prompt for a supervisor's PIN. Only after a manager enters their valid PIN will the discount be applied to the order.

## Key Features
- **Numpad Protection**: Intercepts the "Disc" (discount) mode on the POS numpad.
- **Action Button Protection**: Intercepts the "Discount" control button.
- **Odoo 18 Role Awareness**: Intelligently identifies managers using the new Odoo 18 `_role` prefix system.
- **PIN Hashing**: Securely validates PINs using SHA1 hashing to match Odoo's internal security standards.
- **Seamless UX**: If a manager is already logged in as the current cashier, no PIN is requested.

## Configuration

### 1. Enable POS HR
Ensure that **Point of Sale > Configuration > Settings > Multi-employee with PIN** is enabled.

### 2. Configure Managers
Users who should be able to authorize discounts must either:
- Belong to the **Point of Sale / Administrator** group.
- Be explicitly added as an authorized employee for the POS and assigned the manager role in the `hr.employee` settings.

## Technical Details

### Frontend (JavaScript Overrides)
- **`requestSupervisorPin` Helper**: A shared logic function that:
    1. Checks if `pos_hr` is enabled.
    2. Identifies all loaded employees with `_role === 'manager'`.
    3. Prompts for a PIN using `NumberPopup`.
    4. Validates the SHA1 hash against the employee's `_pin`.
- **`ControlButtons` Patch**: Overrides `clickDiscount` to wrap the standard call in the supervisor check.
- **`ProductScreen` Patch**: Overrides `onNumpadClick` to specifically trap the `discount` event.

### Assets
- Registered in the `point_of_sale._assets_pos` bundle to ensure zero-latency interception of user input.

## Dependencies
- `point_of_sale`
- `pos_discount`
- `pos_hr`
