# POS Mercado Pago (Alpy) - v18.0.0.2

Integrates Odoo Point of Sale with Mercado Pago Point Smart terminals using the modern **Orders API** (v1/orders).

## Overview
This module enables seamless payment processing on Mercado Pago Point Smart terminals directly from the Odoo POS interface. It replaces legacy payment intent flows with the more robust Orders API, supporting real-time status updates via Webhooks and fallback polling.

## Key Features
- **Orders API Integration**: Uses `/v1/orders` for creating and managing terminal payments.
- **Real-time Webhooks**: Professional handling of Mercado Pago notifications via `/pos_mercado_pago_alpy/notification`.
- **Intelligent Polling**: Fallback polling mechanism in the frontend for environments where webhooks might be blocked or delayed.
- **Force PDV Mode**: A debug/management feature to ensure terminals are in the correct operating mode.
- **Idempotency**: Implements `X-Idempotency-Key` using order UUIDs to prevent duplicate charges.

## Configuration

### 1. Mercado Pago Credentials
Go to **Point of Sale > Configuration > Payment Methods** and create/edit a method:
- **Use Payment Terminal**: Select `Mercado Pago Alpy`.
- **Production user token**: Your Mercado Pago Access Token.
- **Production secret key**: Your Webhook Secret Key for signature verification.
- **Terminal S/N**: The Serial Number of your Point Smart device.

### 2. POS Configuration
Add the new payment method to your POS configuration.

## Technical Details

### Backend (Python)
- **`pos.payment.method`**: Added fields for tokens, IDs, and API integration logic (`mp_order_create`, `mp_order_get`, etc.).
- **`MercadoPagoPosRequest`**: Centralized utility for making signed and idempotent requests to Mercado Pago.
- **`PosMercadoPagoWebhook`**: Controller that validates HMAC-SHA256 signatures on incoming notifications and identifies the correct POS session/order using `external_reference` patterns.

### Frontend (JavaScript)
- **`PaymentMercadoPago`**: Extends `PaymentInterface`. Implements `send_payment_request` and `send_payment_cancel`.
- **`handleMercadoPagoWebhook`**: Processes status changes triggered by either webhooks (via WebSocket) or polling.
- **`PosStore` Patch**: Listens for `MERCADO_PAGO_LATEST_MESSAGE` via Odoo's bus system to trigger local status checks.

## Dependencies
- `point_of_sale`

## Not included: bank reconciliation

This module charges payments. It does **not** fetch settlement data (net amount,
fees, release date) from the Mercado Pago API.

That used to live here and ran during POS session closing, where it added a
serial HTTP call per payment to the close. It now lives in the separate
`pos_mercado_pago_reconciliation` add-on, which fetches the same data from a
scheduled job instead, off the closing path.

Payments still record `mp_payment_id` and `mp_external_reference` -- the add-on
needs both to look a payment up.
