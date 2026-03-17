# Odoo POS Enhancement Suite (v18.0)

A collection of professional Odoo 18 modules designed to enhance the Point of Sale experience, optimize retail workflows, and integrate modern payment solutions.

## Repository Structure

This repository contains multiple Odoo modules, each addressing a specific need in the POS ecosystem. Below is an index of the available enhancements:

### 💳 Payment & Finance
- **[POS Mercado Pago (Alpy)](./pos_mercado_pago_alpy/README.md)**: Seamless integration with Mercado Pago Point Smart terminals using the Orders API.
- **[POS Payment Interest Margin](./pos_payment_interest_margin/README.md)**: Automated surcharges for specific payment methods (financing fees).
- **[POS Payment Category](./pos_payment_category/README.md)**: Hierarchical grouping of payment methods for a cleaner UI.
- **[POS Payment Card Details](./pos_payment_card_details/README.md)**: Tracking of terminal lot and coupon numbers for banking conciliation.

### 🧾 Printing & Workflow
- **[POS Retail Pre-Ticket](./pos_retail_pre_ticket/README.md)**: Adds draft receipt printing to standard retail POS without restaurant overhead.
- **[POS Bar Single Ticket](./pos_bar_single_ticket/README.md)**: Split multi-unit orders into separate individual tickets for bar/kitchen service.

### 🛡️ Security & UX
- **[POS Discount Supervisor](./pos_discount_supervisor/README.md)**: Enforces manager PIN authorization for applying discounts.
- **[POS Hide Kitchen Features](./pos_hide_kitchen_features/README.md)**: Hides restaurant-specific buttons for a cleaner retail-focused UI.

## Technical Standards
All modules in this repository follow Odoo 18 best practices:
- **OWL Components**: Modern frontend logic using OWL 2.x/3.x patterns.
- **Patches**: Non-destructive extension of core POS components.
- **Security**: Strict adherence to Odoo's security model and employee role systems.
- **Performance**: Minimal CSS/JS footprint to ensure zero-latency POS operation.

## Installation
1. Clone this repository into your Odoo `addons` path.
2. Update the App list in Odoo.
3. Install the specific enhancement modules as required by your business flow.

---
Developed and maintained by **AlparData**.