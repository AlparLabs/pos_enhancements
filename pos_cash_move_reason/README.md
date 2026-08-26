# POS Cash Move Reason

Configurable concept buttons for the POS cash in/out popup, in the spirit of the
reconciliation model buttons of the bank reconciliation widget.

## Why

By default a POS cash in/out records a free-text reason and posts its counterpart to
the cash journal's **suspense account**, waiting for someone to reconcile it later in
the backend. That costs manual work and produces ten spellings of the same concept.

With this module the cashier taps a button — `PROVEEDORES`, `RETIRO_CHACRAS`,
`SUELDO` — and the journal entry is posted straight against the configured account,
already imputed.

## Configuration

**Point of Sale → Configuration → Cash Move Concepts**

| Field | Meaning |
|---|---|
| Concept | Button label |
| Applies To | Cash In, Cash Out, or Both |
| Counterpart Account | Account to post against. **Leave empty** to keep the standard suspense-account behaviour |
| Contact Mode | No contact / Fixed contact / Ask the cashier |
| Points of Sale | Terminals that show the button. **Leave empty for all terminals** |

In a multi-company database, Counterpart Account and Fixed Contact must belong to the
concept's own company (a company-less contact, the usual case, is always accepted).
Saving a concept that breaks that rule is rejected with an error.

## Behaviour

- The free-text reason field keeps working exactly as before. Concepts are shortcuts,
  never mandatory.
- Selecting a concept prefills the reason and leaves it editable, so the cashier can
  add detail: `PROVEEDORES — Distribuidora López, factura 0001-00034`.
- The statement line's contact stays the **cashier**; the concept's contact is written
  on the **counterpart journal item**, where the aged-payable reports read it.
- A concept without an account only supplies the label, and the movement lands in the
  suspense account as usual — useful to roll out the catalogue before every account
  has been decided.

## Notes

Archive concepts instead of deleting them. Once a concept has been used, the statement
lines that reference it (`ondelete='restrict'`) block its deletion, so history cannot be
erased by accident. A concept that was never used can still be deleted outright.

The Points of Sale scoping is a **UI filter, not a security boundary**. The POS caches
its data when the session opens, so a concept unlinked from a terminal mid-shift still
works until the session is reopened — by design, so a configuration change never blocks
a cashier.
