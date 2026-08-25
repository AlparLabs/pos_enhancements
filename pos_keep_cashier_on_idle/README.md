# POS Keep Cashier On Idle

Keeps the POS screensaver but removes the implicit cashier logout that Odoo 19 attached
to it. Waking the register no longer asks for the employee PIN again.

## The problem

`Chrome` runs `useIdleTimer(this.pos.idleTimeout, ...)`
(`point_of_sale/static/src/app/pos_app.js`). Core defines the steps in
`PosStore.idleTimeout` (`point_of_sale/static/src/app/services/pos_store.js`):

| Inactivity | Core action |
|---|---|
| 2 min (on `LoginScreen`) | `SaverScreen` |
| 3 min | back to `FloorScreen` — added by `pos_restaurant` |
| 5 min | `SaverScreen` |

On the next mouse move / key press the timer calls `pos.navigateToFirstPage()`, and the
`firstPage` getter contains:

```js
if (odoo.from_backend) {
    ...
} else {
    this.resetCashier();      // <-- clears pos.cashier
}
return !this.cashier ? { page: "LoginScreen", params: {} } : this.defaultPage;
```

`odoo.from_backend` is stripped from the URL on the first boot, so every wake-up takes the
`else` branch, wipes the cashier and routes to `LoginScreen`. With `pos_hr` installed that
is the employee PIN prompt. Odoo 18 had no such `else` — this is an 19.0 regression, and
there is no setting to turn it off.

## What this module does

Three overrides on `PosStore` (`static/src/app/overrides/models/pos_store.js`):

- **`firstPage` + `resetCashier`** — a synchronous guard makes the `resetCashier()` call
  that core hides inside `firstPage` a no-op. Every other caller
  (`showLoginScreen()` from the Lock/Logout button, `closePos()`) still logs out normally.
- **`navigate`** — records the page the register was on right before it switched to
  `SaverScreen`.
- **`navigateToFirstPage`** — resumes that page when a cashier is still logged in. Without
  it the wake-up would land on core's `defaultPage`, i.e. `ProductScreen` on
  `openOrder`, which picks the first draft order it finds or creates a new one.

The screensaver itself, its timings and the restaurant 3-minute return to the floor plan
are left untouched.

## Scope / notes

- Depends on `point_of_sale` only; it fixes the core reset, so it works with or without
  `pos_hr`. `pos_hr` is simply where the symptom hurts (PIN re-entry).
- Removing the idle logout means an unattended terminal stays logged in. Cashiers should
  use the Lock/Logout button when leaving the register.
- If instead you want to disable the screensaver entirely, override `idleTimeout` to return
  `[]` rather than installing this module.
