# POS Mercado Pago (Alpy) - v18.0.1.0

Integrates Odoo Point of Sale with Mercado Pago Point Smart terminals and Dynamic QR Code payments using the modern **Orders API** (v1/orders) and **Instore QR API**.

## Overview
This module enables seamless payment processing directly from the Odoo POS interface. It supports:
- **Terminal Smart:** Payments via physical Point Smart devices.
- **Dynamic QR:** Payments via Mercado Pago QR (Local/Physical, On-Screen, or Hybrid).

It replaces legacy payment intent flows with robust APIs, supporting real-time status updates via Webhooks and fallback polling.

## Key Features
- **Orders & Instore API Integration**: Uses modern endpoints for terminal and QR payments.
- **Multiple QR Modalities**: Choose to print the QR, show it on the POS screen, or both (Hybrid).
- **Real-time Webhooks**: Professional handling of Mercado Pago notifications (`merchant_order` for QR, `point_integration_wh` for terminals).
- **Intelligent Polling**: Fallback polling mechanism in the frontend for environments where webhooks might be blocked or delayed.
- **Idempotency**: Implements `X-Idempotency-Key` using order UUIDs to prevent duplicate charges.

## Configuration

### 1. Terminal Smart Configuration
Go to **Point of Sale > Configuration > Payment Methods** and create/edit a method:
- **Use Payment Terminal**: Select `Mercado Pago — Terminal Smart`.
- **Production user token**: Your Mercado Pago Access Token.
- **Production secret key**: Your Webhook Secret Key for signature verification.
- **Terminal S/N**: The Serial Number of your Point Smart device.

### 2. QR Payments Configuration (Local, Screen, Hybrid)
Go to **Point of Sale > Configuration > Payment Methods** and select one of the QR methods. You will need the following data:

- **Production user token** & **Production secret key**: Same as Terminal Smart.
- **Seller User ID (QR)**: Your numeric Mercado Pago user/seller ID.
  * **Where to find it:** In the Mercado Pago panel, go to *Tu Negocio > Configuración > Credenciales* (Your Business > Settings > Credentials) or query the `/users/me` API. It is a long numeric string.
- **POS ID (QR) / `external_pos_id`**: The alphanumeric ID of your cash register.
  * **Where to find it:** In the Mercado Pago panel, go to *Tu Negocio > Locales y Cajas* (Your Business > Stores and Registers). When you create a cash register, you assign it an "ID externo" (External ID) like `CAJA_01`. Use that exact string here.
- **QR URL / String**: The URL encoded in your physical QR code.
  * **Where to find it:** Take the physical QR code that Mercado Pago provided you for this specific cash register. Open your smartphone's **default camera app** (not the Mercado Pago app) and point it at the QR. A link will pop up (usually starting with `https://mpago.la/...`). Copy and paste that exact link here. Odoo will use it to draw the QR on the POS screen.

### 3. POS Configuration
Add the new payment method(s) to your POS configuration.

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
