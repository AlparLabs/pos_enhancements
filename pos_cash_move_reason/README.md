# POS Cash Move Reason

Concept buttons for the POS cash in/out popup, so every terminal spells the same
movement the same way.

## Why

By default a POS cash in/out records a **free-text** reason. The same concept ends up
written in ten different ways across shops and shifts, which makes the movements
impossible to group — and impossible to match automatically in Accounting.

This module adds configurable buttons to the popup. Tapping one writes the concept's
code between square brackets at the front of the reason:

```
[PROVEEDORES] Distribuidora López, factura 0001-00034
```

The cashier keeps typing whatever detail they want after the code.

## Scope

**This module writes nothing accounting.** The cash move still posts against the cash
journal's suspense account, exactly like stock Odoo.

The imputation is configured in **Accounting → Configuration → Reconciliation Models**,
with one model per concept: trigger *Automated*, journal = the POS cash journal, label
*Contains* `[PROVEEDORES]` (brackets included), and a line at 100% against the account.
That configuration is deliberately out of the module: it is the accountant's territory
and it changes at a different pace than the buttons.

Keeping the brackets in the match matters. `Contains [VARIOS]` does not match
`[VARIOS_2]`, whereas `Contains VARIOS` would — a code that is the prefix of another
one would silently steal its movements.

## Configuration

**Point of Sale → Configuration → Cash Move Concepts**

| Field | Meaning |
|---|---|
| Concept | Button label, free to rename at any time |
| Code | What is written into the label between brackets. Reconciliation models match on it |
| Applies To | Cash In, Cash Out, or Both |
| Points of Sale | Terminals that show the button. **Leave empty for all terminals** |

The code is normalised on save: uppercased, accents stripped, spaces turned into
underscores. Square brackets are rejected, since they delimit the code in the label.
Codes are unique per company.

**Renaming a concept is free. Changing its code is not**: the reconciliation model that
matches on the old code stops matching, silently, and the movements pile up in the
suspense account until someone updates it.

## Behaviour

- The free-text reason keeps working exactly as before. Concepts are shortcuts, never
  mandatory, and a movement with no concept behaves like stock Odoo.
- Tapping the selected concept again removes its code and keeps the detail typed after
  it.
- The highlight of the button is derived from the text, not from a separate state. If
  the cashier deletes the code by hand the button turns off on its own — what you see
  is what will be recorded.
- Switching between Cash In and Cash Out removes a code that does not apply to the new
  direction.

## Notes

The Points of Sale scoping is a **UI filter, not a security boundary**. The POS caches
its data when the session opens, so a concept unlinked from a terminal mid-shift still
shows up until the session is reopened — by design, so a configuration change never
blocks a cashier.

Archive concepts instead of deleting them: an archived concept stops being offered, but
the movements already recorded keep their label, and so do the reconciliation models
that match on it.
