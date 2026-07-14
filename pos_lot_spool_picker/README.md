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
  in Settings → Point of Sale → `Enforce spool stock`.

## Known limitations (v1)
- Stock figures are fetched when the popup opens. If another terminal dispatches from the same
  lot while the popup is open, the number can go stale; use **Actualizar** to refetch. The
  authoritative check still happens server-side at picking validation.
- Internal pre-ticket copy with per-bobina breakdown is not included (planned v2).
