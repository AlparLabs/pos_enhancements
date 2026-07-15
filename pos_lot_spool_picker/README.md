# POS Lot Spool Picker

Replaces the native POS lot popup for lot/serial-tracked products with a spool picker
tailored to selling by the meter from large spools (bobinas).

## Features
- Lists available lots with **remaining meters + storage location** (fresh per popup open
  via the native `get_existing_lots` RPC, extended to return location).
- Auto-suggests the **smallest lot whose remaining >= requested** (anti-retazo); falls back
  to combining partial lots when none covers alone.
- Splits one sale across several lots but keeps **one customer-facing order line** (invoice,
  ticket and pre-ticket all show a single line). The split lives only in the delivery picking
  as one stock move with several move lines.
- **Warn (default)** or **hard-block** when the assignment exceeds real stock, toggled per POS
  in Settings → Point of Sale → Inventory section → `Enforce Spool Stock`.

## Scope
Only products tracked **by lot** (`tracking = 'lot'`) get the new picker. Serial-tracked
products (`tracking = 'serial'`) keep the native lot/serial popup untouched, since a serial
already maps 1:1 to a unit and has no "remaining meters" concept.

## Known limitations (v1)
- Stock figures are fetched when the popup opens. If another terminal dispatches from the same
  lot while the popup is open, the number can go stale; use **Actualizar** to refetch. The
  authoritative check still happens server-side at picking validation.
- If the `get_existing_lots` RPC fails (network/server error) when a product is first added,
  the picker falls back to the native lot popup rather than blocking the sale.
- Internal pre-ticket copy with per-bobina breakdown is not included (planned v2).
- Real-time cross-terminal stock reservation is not included beyond the manual **Actualizar**
  refresh (planned v2 — this client runs multiple POS terminals against shared stock).
