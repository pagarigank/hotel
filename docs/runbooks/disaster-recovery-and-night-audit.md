# Disaster Recovery, Night Audit Resumption & Privacy Governance Runbook

**System:** Innkeeper Hospitality PMS / Multi-Tenant SaaS  
**Phase:** Phase 8 Hardening, Observability & Compliance  
**Last Verified:** October 2026  

---

## 1. Disaster Recovery & Business Continuity (PITR)

### 1.1 Recovery Objectives
- **Recovery Point Objective (RPO):** $\le 5\text{ minutes}$ (continuous WAL archiving).
- **Recovery Time Objective (RTO):** $\le 60\text{ minutes}$ (automated base backup + WAL replay).

### 1.2 Point-in-Time Recovery (PITR) Drill Procedure
1. **Identify Target Timestamp:**
   Identify the recovery target timestamp prior to the corruption event (e.g. `2026-10-12 02:15:00 UTC`).
2. **Halt Mutating API Traffic:**
   Place the API gateway / load balancer in maintenance mode (`503 Service Unavailable` with `Retry-After: 300`).
3. **Restore Base Backup:**
   ```bash
   pg_basebackup -h backup-storage -D /var/lib/postgresql/data -U replicator -v -P -X stream
   ```
4. **Configure Recovery Target:**
   In `postgresql.conf` / `recovery.signal`:
   ```ini
   restore_command = 'cp /mnt/wal_archive/%f %p'
   recovery_target_time = '2026-10-12 02:15:00 UTC'
   recovery_target_action = 'promote'
   ```
5. **Start PostgreSQL Instance:**
   Start service and monitor logs:
   ```bash
   tail -f /var/log/postgresql/postgresql-recovery.log
   ```
6. **Verify Data & Invariant Health:**
   Run the automated database integrity verification script:
   ```bash
   pnpm --filter @innkeeper/api test src/hardening-compliance.test.ts
   pnpm test:rls
   ```
7. **Resume Traffic:**
   Re-enable public gateway routing and verify health endpoint `GET /health/ready` returns HTTP 200.

---

## 2. Night Audit Failure Recovery & Emergency Resumption

### 2.1 State Machine Architecture
The Innkeeper Night Audit executes sequentially through 6 checkpointed state machine steps:
1. `validate_business_date`: Enforces single-instance branch lock.
2. `verify_open_folios`: Verifies all in-house stays have open folios.
3. `post_room_charges`: Posts nightly lodging charges idempotently (`UNIQUE(stay_id, business_date)`).
4. `post_gl_vouchers`: Generates balanced General Ledger journal entries (`SUM(debit) = SUM(credit)`).
5. `roll_business_date`: Updates branch current operational date (`business_date = business_date + 1`).
6. `generate_audit_reports`: Compiles daily flash report and KPI snapshot.

### 2.2 Failure Diagnosis
When an audit fails, check the `night_audits` state table:
```sql
SELECT id, branch_id, business_date, status, failed_at_step, error_message, started_at
FROM night_audits
WHERE status = 'failed'
ORDER BY started_at DESC LIMIT 1;
```

### 2.3 Resumption Runbook
- **Case A: Failure at `post_room_charges`:**
  - Root cause is usually missing rate plan or unassigned room charge code.
  - Action: Fix the rate plan mapping, then re-trigger `POST /api/v1/night-audit/run`.
  - The service is physically idempotent; previously posted charges are skipped without duplication.
- **Case B: Failure at `post_gl_vouchers` due to Closed Fiscal Period:**
  - Error: `Fiscal period is closed; only open periods accept posted vouchers`.
  - Action: Check accounting fiscal periods in `fiscal_periods` table.
  - Reopen the current fiscal month or advance period lock with manager authorization (`POST /api/v1/accounting/periods/:id/close` / override).
  - Re-run audit.
- **Case C: Manual Rollback / Emergency Reset:**
  If a catastrophic crash corrupts in-flight memory state:
  ```sql
  -- Emergency unlock query (Run as innkeeper_owner role only):
  UPDATE night_audits 
  SET status = 'failed', error_message = 'Manually aborted by operator intervention'
  WHERE status = 'running' AND started_at < now() - interval '1 hour';
  ```

---

## 3. Privacy & Data Governance Operations (GDPR & Philippine DPA)

### 3.1 Subject Access Request (SAR) Procedure
1. Request received from guest with identity proof.
2. Query `GET /api/v1/compliance/gdpr/export/:guestId`.
3. System aggregates personal profile, preferences, encrypted ID metadata, reservations, and stays.
4. Export JSON or deliver through authenticated data portal.
5. System records immutable entry in `privacy_audit_logs` with action `'data_export'`.

### 3.2 Right-to-Erasure Workflow & Tax Ledger Harmonization
- **Requirement:** GDPR Art. 17 / Philippine DPA Sec. 16.
- **Conflict with Tax Laws:** Philippine BIR, US IRS, and international tax rules mandate retaining financial ledgers, vouchers, and folios for $\ge 7\text{ to }10\text{ years}$.
- **Harmonized Solution:**
  1. Verify the guest has no active open folios with non-zero balances (`ABS(balance) > 0.01`). If active balances exist, erasure is rejected with HTTP 400.
  2. Invoke `POST /api/v1/compliance/gdpr/erase/:guestId` with explicit consent confirmation.
  3. System salts and hashes the guest ID into pseudonym `DELETED_GUEST_<12-char-hash>`.
  4. Personal details (`first_name`, `email`, `phone`, `birth_date`, `nationality`, `notes`, `attrs`) are cleared.
  5. Sensitive records in `guest_identifications` and `guest_prefs` are purged.
  6. Financial folios, invoices, and accounting entries remain preserved under the pseudonymized guest identifier for tax audit integrity.
  7. An immutable audit record is logged to `privacy_audit_logs`.
