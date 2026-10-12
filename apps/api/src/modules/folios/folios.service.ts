import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { EventsService } from '../properties/events.service.js';
import type {
  PostFolioLineDto,
  VoidFolioLineDto,
  TransferFolioLineDto,
  RecordPaymentDto,
  FolioDto,
  FolioLineDto,
} from '@innkeeper/contracts';

@Injectable()
export class FoliosService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventsService) private readonly eventsService: EventsService,
  ) {}

  /**
   * Create a new Folio
   */
  async createFolio(
    tenantId: string,
    branchId: string,
    params: {
      stayId?: string;
      reservationId?: string;
      companyId?: string;
      kind?: 'guest' | 'master' | 'city_ledger' | 'incidental';
      currency?: string;
    },
    client?: pg.PoolClient,
  ): Promise<FolioDto> {
    const runInClient = async (c: pg.PoolClient) => {
      const folioId = crypto.randomUUID();
      const currentYear = new Date().getFullYear();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const folioNo = `FOL-${currentYear}-${randomSuffix}`;
      const kind = params.kind || 'guest';
      const currency = params.currency || 'USD';

      const insertRes = await c.query(
        `INSERT INTO folios (
          id, tenant_id, branch_id, folio_no, kind,
          stay_id, reservation_id, company_id, status,
          currency, total_charges, total_payments, balance, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, 0, 0, 0, 1)
        RETURNING *`,
        [
          folioId,
          tenantId,
          branchId,
          folioNo,
          kind,
          params.stayId || null,
          params.reservationId || null,
          params.companyId || null,
          currency,
        ],
      );

      const row = insertRes.rows[0];
      return this.mapFolioRow(row, []);
    };

    if (client) return runInClient(client);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Get Folio by ID with all lines
   */
  async getFolioById(tenantId: string, folioId: string, client?: pg.PoolClient): Promise<FolioDto> {
    const runInClient = async (c: pg.PoolClient) => {
      const folioRes = await c.query(
        `SELECT * FROM folios WHERE id = $1 AND tenant_id = $2`,
        [folioId, tenantId],
      );
      if (folioRes.rows.length === 0) {
        throw new NotFoundException(`Folio ${folioId} not found`);
      }

      const linesRes = await c.query(
        `SELECT * FROM folio_lines
         WHERE folio_id = $1 AND tenant_id = $2
         ORDER BY window_no ASC, created_at ASC`,
        [folioId, tenantId],
      );

      return this.mapFolioRow(folioRes.rows[0], linesRes.rows);
    };

    if (client) return runInClient(client);
    return this.db.withTenantConnection(tenantId, undefined, runInClient);
  }

  /**
   * Get primary Folio for a Stay
   */
  async getFolioByStayId(tenantId: string, stayId: string, client?: pg.PoolClient): Promise<FolioDto> {
    const runInClient = async (c: pg.PoolClient) => {
      const folioRes = await c.query(
        `SELECT * FROM folios WHERE stay_id = $1 AND tenant_id = $2 ORDER BY created_at ASC LIMIT 1`,
        [stayId, tenantId],
      );
      if (folioRes.rows.length === 0) {
        throw new NotFoundException(`Folio for stay ${stayId} not found`);
      }

      const linesRes = await c.query(
        `SELECT * FROM folio_lines
         WHERE folio_id = $1 AND tenant_id = $2
         ORDER BY window_no ASC, created_at ASC`,
        [folioRes.rows[0].id, tenantId],
      );

      return this.mapFolioRow(folioRes.rows[0], linesRes.rows);
    };

    if (client) return runInClient(client);
    return this.db.withTenantConnection(tenantId, undefined, runInClient);
  }

  /**
   * Post a charge to a Folio window (Append-only)
   */
  async postCharge(
    tenantId: string,
    folioId: string,
    dto: PostFolioLineDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<FolioLineDto> {
    const runInClient = async (c: pg.PoolClient) => {
      // 1. Lock Folio row for concurrency integrity
      const folioRes = await c.query(
        `SELECT * FROM folios WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [folioId, tenantId],
      );
      if (folioRes.rows.length === 0) {
        throw new NotFoundException(`Folio ${folioId} not found`);
      }
      const folio = folioRes.rows[0];

      if (folio.status === 'closed') {
        throw new BadRequestException(`Cannot post charge to a closed folio`);
      }

      // 2. Fetch current branch business date
      const branchRes = await c.query(
        `SELECT business_date FROM branches WHERE id = $1 AND tenant_id = $2`,
        [folio.branch_id, tenantId],
      );
      const businessDate = branchRes.rows[0]?.business_date || new Date().toISOString().split('T')[0];

      const lineId = crypto.randomUUID();
      const qty = dto.qty || 1;
      const unitAmount = Number(dto.unitAmount);
      const taxAmount = Number(dto.taxAmount || 0);
      const totalAmount = qty * unitAmount + taxAmount;

      // 3. Insert append-only line
      const insertLineRes = await c.query(
        `INSERT INTO folio_lines (
          id, tenant_id, branch_id, folio_id, stay_id, window_no,
          business_date, line_type, charge_type, charge_code_id,
          description, qty, unit_amount, amount, tax_amount, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          lineId,
          tenantId,
          folio.branch_id,
          folioId,
          folio.stay_id,
          dto.windowNo || 1,
          businessDate,
          dto.lineType || 'charge',
          dto.chargeType,
          dto.chargeCodeId || null,
          dto.description,
          qty,
          unitAmount,
          totalAmount,
          taxAmount,
          userId || null,
        ],
      );

      // 4. Update Folio balance and increment version
      await c.query(
        `UPDATE folios
         SET total_charges = total_charges + $1,
             balance = balance + $1,
             version = version + 1,
             updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [totalAmount, folioId, tenantId],
      );

      // 5. Emit event
      this.eventsService.broadcast(
        tenantId,
        'innkeeper.folios.charge_posted',
        {
          folioId,
          lineId,
          stayId: folio.stay_id,
          amount: totalAmount,
          chargeType: dto.chargeType,
        },
        folio.branch_id,
      );

      return this.mapLineRow(insertLineRes.rows[0]);
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Record a Payment tender (PCI DSS Tokenized, zero raw PAN storage)
   */
  async recordPayment(
    tenantId: string,
    folioId: string,
    dto: RecordPaymentDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<{ payment: any; folioLine: FolioLineDto }> {
    const runInClient = async (c: pg.PoolClient) => {
      // 1. Lock Folio
      const folioRes = await c.query(
        `SELECT * FROM folios WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [folioId, tenantId],
      );
      if (folioRes.rows.length === 0) {
        throw new NotFoundException(`Folio ${folioId} not found`);
      }
      const folio = folioRes.rows[0];

      if (folio.status === 'closed') {
        throw new BadRequestException(`Cannot record payment on closed folio`);
      }

      const branchRes = await c.query(
        `SELECT business_date FROM branches WHERE id = $1 AND tenant_id = $2`,
        [folio.branch_id, tenantId],
      );
      const businessDate = branchRes.rows[0]?.business_date || new Date().toISOString().split('T')[0];

      // 2. Tokenized Payment Intent if card
      let paymentIntentId: string | null = null;
      if (dto.paymentMethod === 'card') {
        paymentIntentId = crypto.randomUUID();
        const gatewayIntentId = `pi_${crypto.randomBytes(12).toString('hex')}`;
        await c.query(
          `INSERT INTO payment_intents (
            id, tenant_id, branch_id, gateway_name, gateway_intent_id,
            amount, currency, status, payment_method_token, last_four, card_brand
          ) VALUES ($1, $2, $3, 'simulated', $4, $5, $6, 'succeeded', $7, $8, $9)`,
          [
            paymentIntentId,
            tenantId,
            folio.branch_id,
            gatewayIntentId,
            dto.amount,
            folio.currency,
            dto.cardToken || 'tok_simulated_token',
            dto.lastFour || '4242',
            dto.cardBrand || 'visa',
          ],
        );
      }

      // 3. Record Tender in payments table
      const paymentId = crypto.randomUUID();
      const methodMap: Record<string, string> = {
        card: 'card_online',
        cash: 'cash',
        bank_transfer: 'card_online',
        city_ledger: 'city_ledger',
      };
      const dbMethod = methodMap[dto.paymentMethod] || 'cash';

      const paymentRes = await c.query(
        `INSERT INTO payments (
          id, tenant_id, branch_id, folio_id, payment_intent_id,
          payment_method, amount, currency, reference_no, tendered_amount,
          captured_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          paymentId,
          tenantId,
          folio.branch_id,
          folioId,
          paymentIntentId,
          dbMethod,
          dto.amount,
          folio.currency,
          dto.reference || `REF-${Date.now()}`,
          dto.amount,
          userId || '10000000-0000-0000-0000-000000000001',
        ],
      );

      // 4. Create Folio Line for Payment tender (Append-only)
      const lineId = crypto.randomUUID();
      const lineDesc =
        dto.paymentMethod === 'card'
          ? `Payment: Card ending in ${dto.lastFour || '****'}`
          : `Payment: ${dto.paymentMethod.toUpperCase()} ${dto.reference ? `(${dto.reference})` : ''}`;

      const insertLineRes = await c.query(
        `INSERT INTO folio_lines (
          id, tenant_id, branch_id, folio_id, stay_id, window_no,
          business_date, line_type, charge_type, description,
          qty, unit_amount, amount, tax_amount, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'payment', 'payment', $8, 1, $9, $10, 0, $11)
        RETURNING *`,
        [
          lineId,
          tenantId,
          folio.branch_id,
          folioId,
          folio.stay_id,
          dto.windowNo || 1,
          businessDate,
          lineDesc,
          -Number(dto.amount),
          -Number(dto.amount),
          userId || null,
        ],
      );

      // 5. Update Folio balance and total_payments
      await c.query(
        `UPDATE folios
         SET total_payments = total_payments + $1,
             balance = balance - $1,
             version = version + 1,
             updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [dto.amount, folioId, tenantId],
      );

      // 6. Emit event
      this.eventsService.broadcast(
        tenantId,
        'innkeeper.folios.payment_recorded',
        {
          folioId,
          paymentId,
          amount: dto.amount,
          method: dto.paymentMethod,
        },
        folio.branch_id,
      );

      return {
        payment: paymentRes.rows[0],
        folioLine: this.mapLineRow(insertLineRes.rows[0]),
      };
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Void a Folio Line (Append-only Reversal: creates negative line linking reverses_line_id)
   */
  async voidLine(
    tenantId: string,
    folioId: string,
    lineId: string,
    dto: VoidFolioLineDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<FolioLineDto> {
    const runInClient = async (c: pg.PoolClient) => {
      // 1. Lock Folio
      const folioRes = await c.query(
        `SELECT * FROM folios WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [folioId, tenantId],
      );
      if (folioRes.rows.length === 0) {
        throw new NotFoundException(`Folio ${folioId} not found`);
      }
      const folio = folioRes.rows[0];

      // 2. Fetch Target Line
      const targetLineRes = await c.query(
        `SELECT * FROM folio_lines WHERE id = $1 AND folio_id = $2 AND tenant_id = $3`,
        [lineId, folioId, tenantId],
      );
      if (targetLineRes.rows.length === 0) {
        throw new NotFoundException(`Folio line ${lineId} not found`);
      }
      const targetLine = targetLineRes.rows[0];

      // 3. Ensure not already reversed
      const existingReversal = await c.query(
        `SELECT id FROM folio_lines WHERE reverses_line_id = $1 AND tenant_id = $2`,
        [lineId, tenantId],
      );
      if (existingReversal.rows.length > 0) {
        throw new ConflictException(`Line ${lineId} has already been voided/reversed`);
      }

      const branchRes = await c.query(
        `SELECT business_date FROM branches WHERE id = $1 AND tenant_id = $2`,
        [folio.branch_id, tenantId],
      );
      const businessDate = branchRes.rows[0]?.business_date || new Date().toISOString().split('T')[0];

      // 4. Create Reversal Line with negative amount
      const reversalId = crypto.randomUUID();
      const reversalAmount = -Number(targetLine.amount);
      const reversalTax = -Number(targetLine.tax_amount);

      const insertReversalRes = await c.query(
        `INSERT INTO folio_lines (
          id, tenant_id, branch_id, folio_id, stay_id, window_no,
          business_date, line_type, charge_type, charge_code_id,
          description, qty, unit_amount, amount, tax_amount,
          reverses_line_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'adjustment', $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          reversalId,
          tenantId,
          folio.branch_id,
          folioId,
          folio.stay_id,
          targetLine.window_no,
          businessDate,
          targetLine.charge_type,
          targetLine.charge_code_id,
          `VOID: ${targetLine.description} (${dto.reason})`,
          targetLine.qty,
          -Number(targetLine.unit_amount),
          reversalAmount,
          reversalTax,
          lineId,
          userId || null,
        ],
      );

      // 5. Update Folio balance
      await c.query(
        `UPDATE folios
         SET total_charges = total_charges + $1,
             balance = balance + $1,
             version = version + 1,
             updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [reversalAmount, folioId, tenantId],
      );

      // 6. Emit event
      this.eventsService.broadcast(
        tenantId,
        'innkeeper.folios.line_voided',
        {
          folioId,
          originalLineId: lineId,
          reversalLineId: reversalId,
          reason: dto.reason,
        },
        folio.branch_id,
      );

      return this.mapLineRow(insertReversalRes.rows[0]);
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Transfer Folio Line (Between windows 1-4 or to another folio)
   */
  async transferLine(
    tenantId: string,
    folioId: string,
    lineId: string,
    dto: TransferFolioLineDto,
    userId?: string,
    existingClient?: pg.PoolClient,
  ): Promise<{ sourceReversal: FolioLineDto; targetLine: FolioLineDto }> {
    const runInClient = async (c: pg.PoolClient) => {
      // 1. Lock source folio
      const sourceFolioRes = await c.query(
        `SELECT * FROM folios WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [folioId, tenantId],
      );
      if (sourceFolioRes.rows.length === 0) {
        throw new NotFoundException(`Source folio ${folioId} not found`);
      }
      const sourceFolio = sourceFolioRes.rows[0];

      // 2. Fetch line
      const targetLineRes = await c.query(
        `SELECT * FROM folio_lines WHERE id = $1 AND folio_id = $2 AND tenant_id = $3`,
        [lineId, folioId, tenantId],
      );
      if (targetLineRes.rows.length === 0) {
        throw new NotFoundException(`Folio line ${lineId} not found`);
      }
      const line = targetLineRes.rows[0];

      const targetFolioId = dto.targetFolioId || folioId;
      const targetWindowNo = dto.targetWindowNo;

      // 3. Create negative transfer line in source window
      const sourceReversalId = crypto.randomUUID();
      const insertSourceTransferRes = await c.query(
        `INSERT INTO folio_lines (
          id, tenant_id, branch_id, folio_id, stay_id, window_no,
          business_date, line_type, charge_type, charge_code_id,
          description, qty, unit_amount, amount, tax_amount,
          reverses_line_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'transfer', $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          sourceReversalId,
          tenantId,
          sourceFolio.branch_id,
          folioId,
          sourceFolio.stay_id,
          line.window_no,
          line.business_date,
          line.charge_type,
          line.charge_code_id,
          `TRANSFER OUT to Window ${targetWindowNo}: ${line.description}`,
          line.qty,
          -Number(line.unit_amount),
          -Number(line.amount),
          -Number(line.tax_amount),
          lineId,
          userId || null,
        ],
      );

      // 4. Create positive transfer line in destination window
      const targetLineId = crypto.randomUUID();
      const insertTargetTransferRes = await c.query(
        `INSERT INTO folio_lines (
          id, tenant_id, branch_id, folio_id, stay_id, window_no,
          business_date, line_type, charge_type, charge_code_id,
          description, qty, unit_amount, amount, tax_amount, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'transfer', $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          targetLineId,
          tenantId,
          sourceFolio.branch_id,
          targetFolioId,
          sourceFolio.stay_id,
          targetWindowNo,
          line.business_date,
          line.charge_type,
          line.charge_code_id,
          `TRANSFER IN from Window ${line.window_no}: ${line.description}`,
          line.qty,
          Number(line.unit_amount),
          Number(line.amount),
          Number(line.tax_amount),
          userId || null,
        ],
      );

      // If transferring across different folios, update both balances
      if (targetFolioId !== folioId) {
        await c.query(
          `UPDATE folios SET total_charges = total_charges - $1, balance = balance - $1, version = version + 1 WHERE id = $2`,
          [Number(line.amount), folioId],
        );
        await c.query(
          `UPDATE folios SET total_charges = total_charges + $1, balance = balance + $1, version = version + 1 WHERE id = $2`,
          [Number(line.amount), targetFolioId],
        );
      }

      return {
        sourceReversal: this.mapLineRow(insertSourceTransferRes.rows[0]),
        targetLine: this.mapLineRow(insertTargetTransferRes.rows[0]),
      };
    };

    if (existingClient) return runInClient(existingClient);
    return this.db.transaction(tenantId, runInClient);
  }

  /**
   * Generate Invoice Summary Data with window and tax breakdown
   */
  async getInvoiceData(tenantId: string, folioId: string): Promise<any> {
    const folio = await this.getFolioById(tenantId, folioId);

    // Group lines by window
    const windows = [1, 2, 3, 4].map((wNo) => {
      const windowLines = (folio.lines || []).filter((l) => l.windowNo === wNo);
      const charges = windowLines
        .filter((l) => l.lineType !== 'payment')
        .reduce((sum, l) => sum + l.amount, 0);
      const payments = windowLines
        .filter((l) => l.lineType === 'payment')
        .reduce((sum, l) => sum + Math.abs(l.amount), 0);
      return {
        windowNo: wNo,
        charges,
        payments,
        balance: charges - payments,
        lines: windowLines,
      };
    });

    return {
      folioNo: folio.folioNo,
      currency: folio.currency,
      totalCharges: folio.totalCharges,
      totalPayments: folio.totalPayments,
      balance: folio.balance,
      windows,
      generatedAt: new Date().toISOString(),
    };
  }

  private mapFolioRow(row: any, lines: any[] = []): FolioDto {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      folioNo: row.folio_no,
      kind: row.kind,
      stayId: row.stay_id,
      reservationId: row.reservation_id,
      companyId: row.company_id,
      status: row.status,
      currency: row.currency,
      totalCharges: Number(row.total_charges || 0),
      totalPayments: Number(row.total_payments || 0),
      balance: Number(row.balance || 0),
      version: row.version,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      lines: lines.map((l) => this.mapLineRow(l)),
    };
  }

  private mapLineRow(row: any): FolioLineDto {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      folioId: row.folio_id,
      stayId: row.stay_id,
      windowNo: Number(row.window_no || 1),
      businessDate: row.business_date instanceof Date ? row.business_date.toISOString().split('T')[0] : String(row.business_date),
      lineType: row.line_type,
      chargeType: row.charge_type,
      chargeCodeId: row.charge_code_id,
      description: row.description,
      qty: Number(row.qty || 1),
      unitAmount: Number(row.unit_amount || 0),
      amount: Number(row.amount || 0),
      taxAmount: Number(row.tax_amount || 0),
      reversesLineId: row.reverses_line_id,
      paymentIntentId: row.payment_intent_id,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }
}
