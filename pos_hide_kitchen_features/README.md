# POS Hide Kitchen Features - v18.0.1.0.0

Cleans up the Point of Sale interface for retail environments by hiding restaurant-specific features like kitchen notes and order submission buttons.

## Overview
Sometimes a retail store needs certain features from the `pos_restaurant` module (like pre-tickets or specific hardware integrations) but does not want the kitchen-centric buttons (Submit Order, Kitchen Note) cluttering the screen. This module uses surgical CSS to hide these elements, providing a streamlined "Retail-only" look while maintaining restaurant-module functionalities in the background.

## Key Features
- **UI Simplification**: Removes the "Submit Order" button from the product screen.
- **Note Removal**: Hides the "Internal Note" / "Kitchen Note" button.
- **Pure CSS Solution**: Zero performance overhead and high compatibility with other modules.
- **Odoo 18 Optimized**: Targets the specific CSS classes and DOM structures used in the latest version.

## Technical Details

### Frontend (CSS)
- **`pos_hide_buttons.css`**: Contains `display: none !important;` rules for:
    - `.submit-order` (The main kitchen communication button).
    - `.orderline-note-button` (The per-line note feature).
    - `.control-button:has(i.fa-sticky-note)` (Safety fallback for the note icon).

## Setup
Simply install the module. The CSS is loaded automatically into the `point_of_sale._assets_pos` bundle and takes effect immediately in all POS sessions.

## Dependencies
- `point_of_sale`
- `pos_restaurant`
