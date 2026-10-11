---
name: innkeeper-reservations-availability
description: Reservation, availability, rates, check-in/check-out, folio and night-audit rules for Innkeeper on PostgreSQL. Use when implementing or debugging booking creation, double-booking or overbooking, room assignment or moves, rate plans and restrictions, deposits and cancellation policies, holds, groups, folio postings, business date rollover, or night audit - and whenever concurrency, idempotency or date-range logic is involved.
---

# Reservations, availability, folio, night audit

## Dates and time
- Stay dates = `date` in the **branch timezone**; stays are half-open `[check_in, check_out)` (check-out day is available for the next arrival).
- Instants = UTC `timestamptz`. `business_date` is per branch and moves only via night audit.

## Never double-book: layered defence
1. **Inventory counters** `room_type_inventory(branch, type, date, capacity, sold, overbook_allowance)` with `CHECK (sold <= capacity + overbook_allowance)` for unassigned/type-level sales.
2. **Exclusion constraint** for assigned units:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reservation_units ADD CONSTRAINT no_double_booking EXCLUDE USING gist (
  unit_id WITH =, daterange(check_in, check_out, '[)') WITH &&
) WHERE (unit_id IS NOT NULL AND status IN ('hold','confirmed','in_house'));
```
Cancelled/checked-out rows drop out via the partial predicate. Violation SQLSTATE `23P01` -> HTTP 409 `ROOM_NOT_AVAILABLE`.
3. Both in **one transaction**; UI pre-checks are only for UX.
4. `Idempotency-Key` required on create/modify; same key+payload replays stored response; same key+different payload -> 422.

## Booking algorithm
```text
validate restrictions per night (min/max LOS, CTA/CTD, stop-sell, advance purchase)
BEGIN (tenant ctx)
  UPDATE room_type_inventory SET sold = sold + :n WHERE branch,type,date IN range AND NOT stop_sell
    -> rowcount must equal nights else NO_INVENTORY (CHECK failure -> NO_INVENTORY)
  [if unit chosen] INSERT reservation_units  -- exclusion race resolved by DB
  INSERT reservation, nights(priced snapshot), deposit schedule, policy_snapshot
  INSERT outbox 'reservation.created'
COMMIT
```
Cancel/no-show/modify/move: decrement the same counters (and release unit) in the same transaction as the status change. Holds carry `hold_expires_at`; a worker cancels expired holds and releases counters.

## Pricing
- Rate resolution: plan -> season/date rate -> day-of-week/occupancy adjustments -> packages/extras -> taxes/service charge (data-driven rules, inclusive/exclusive, compound).
- Store a **priced nights snapshot** (`reservation_nights`) and tax snapshot; later rate edits never change booked prices unless the user re-prices.
- Quote endpoint returns per-night breakdown identical to what booking will charge.

## Policies
Deposit, cancellation windows/fees, no-show fee are configurable per rate plan and **copied to `reservations.policy_snapshot`**.

## Check-in / check-out
- Check-in: require unit `is_sellable` + status allowed by setting `frontdesk.checkin.requireCleanRoom`; create `stay`, open `folio`, set unit `occupied`, record ID, payment token (never PAN).
- Check-out: if folio balance != 0 require payment or **city-ledger transfer**; post pending charges; issue invoice (voucher via posting rules); unit -> dirty; create HK task; close folio.
- Room move: new `reservation_units` segment (exclusion applies), folio continues; optional rate retention.

## Folio rules
`folio_lines` is append-only (trigger). Charges positive, payments negative. Void = reversing line (permission `folio.charge.void` + reason + limit check). Transfers create paired lines. Closed folio rejects lines. Split billing via `window_no`. Each line stores `source_type/source_id` and later `voucher_id`.

## Night audit (per branch; resumable; idempotent)
States: `pending -> running(step) -> completed | failed(step)`; persist each step.
1. Pre-checks (late arrivals -> no-show per policy, due-outs, open POS bills)
2. Post room + tax (+ service) for each in-house stay for the current business date (unique key `(stay_id, business_date, 'room')` makes re-runs safe)
3. Post no-show/cancel fees and recurring rent
4. Roll `business_date`
5. Generate vouchers per posting rules (per-line or daily-summary mode)
6. Snapshot KPIs (occupancy, ADR, RevPAR); produce report pack
On failure: business date unchanged, alert raised, runbook link in the message.

## Tests to write
Parallel booking of the last unit (exactly one wins). Adjacent stays (out 12th / in 12th) allowed. Cancel then rebook same unit works. Idempotent replay. Hold expiry releases inventory. Night audit re-run does not double-post. Closed-folio post rejected.
