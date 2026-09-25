# POS Mercado Pago Reconciliation

Adds bank-reconciliation data to Mercado Pago payments taken in the Point of Sale:
the **net amount** actually credited, the **fees** charged, and the **release date**
of the money.

Requires `pos_mercado_pago_alpy`, which charges the payments and records the
identifiers this module needs to look them up.

## Why it is a separate module

Fetching this data means one to two HTTP calls to the Mercado Pago API **per payment**.
That work used to run inside the POS session closing, where it added 15–30 seconds to
a 50-payment close and far more when the API was slow. Here it runs from a scheduled
job, so closing a session never waits on Mercado Pago.

## How it works

An hourly scheduled job — **Settings → Technical → Scheduled Actions → "POS: fetch
Mercado Pago settlement data"** — sweeps payments that are not settled yet, up to 200
per run, looking back 30 days.

Each payment is resolved on Mercado Pago by its payment id, or by its external
reference when the id is alphanumeric (the Orders API returns those).

## Settlement states

| State | Meaning |
|---|---|
| *(empty)* | Not a payment this module settles — cash, customer account, any non-Mercado-Pago method |
| **Pending** | Mercado Pago has no final figures yet. The job will try again |
| **Settled** | Final figures received, including a release date |

A payment stays **Pending** until a release date comes back. That matters: a payment
can be approved without being accredited, and its net amount at that moment is not
final. Storing those figures as if they were would silently understate what was
actually credited.

Payments older than the 30-day window stop being retried and simply stay **Pending** —
filter on that state to find them.

## Where the data shows up

On the `pos.payment` list and form, in **Point of Sale → Orders → Payments**.
