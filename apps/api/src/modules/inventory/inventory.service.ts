import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import pg from 'pg';
import crypto from 'node:crypto';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { AccountingService } from '../accounting/accounting.service.js';
import {
  type UomDto,
  type CreateUomDto,
  type ItemCategoryDto,
  type CreateItemCategoryDto,
  type WarehouseDto,
  type CreateWarehouseDto,
  type SupplierDto,
  type CreateSupplierDto,
  type ItemDto,
  type CreateItemDto,
  type StockBalanceDto,
  type StockLedgerEntryDto,
  type PurchaseOrderDto,
  type CreatePurchaseOrderDto,
  type GoodsReceiptNoteDto,
  type CreateGrnDto,
  type StockIssueDto,
  type CreateStockIssueDto,
  type StockTransferDto,
  type CreateStockTransferDto,
  type StockAdjustmentDto,
  type CreateStockAdjustmentDto,
  type StockCountDto,
  type CreateStockCountDto,
  type SubmitCountLinesDto,
  type InventoryValuationReportDto,
} from '@innkeeper/contracts';

function formatDateOnly(d: string | Date): string {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class InventoryService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AccountingService) private readonly accountingService: AccountingService,
  ) {}

  // ==========================================================================
  // 1. Master Data: UoM, Categories, Warehouses, Suppliers, Items
  // ==========================================================================

  async getUoms(tenantId: string): Promise<UomDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(`SELECT * FROM uoms WHERE tenant_id = $1 ORDER BY code ASC`, [tenantId]);
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      category: r.category,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createUom(tenantId: string, dto: CreateUomDto): Promise<UomDto> {
    const id = crypto.randomUUID();
    const res = await this.db.transaction(tenantId, async (client) => {
      const q = await client.query(
        `INSERT INTO uoms (id, tenant_id, code, name, category)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, tenantId, dto.code.toUpperCase(), dto.name, dto.category],
      );
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      code: res.code,
      name: res.name,
      category: res.category,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  async getItemCategories(tenantId: string): Promise<ItemCategoryDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(`SELECT * FROM item_categories WHERE tenant_id = $1 ORDER BY code ASC`, [tenantId]);
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      parentId: r.parent_id,
      defaultValuationMethod: r.default_valuation_method,
      glInventoryAccountId: r.gl_inventory_account_id,
      glCogsAccountId: r.gl_cogs_account_id,
      glExpenseAccountId: r.gl_expense_account_id,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createItemCategory(tenantId: string, dto: CreateItemCategoryDto): Promise<ItemCategoryDto> {
    const id = crypto.randomUUID();
    const res = await this.db.transaction(tenantId, async (client) => {
      const q = await client.query(
        `INSERT INTO item_categories (
          id, tenant_id, code, name, parent_id, default_valuation_method,
          gl_inventory_account_id, gl_cogs_account_id, gl_expense_account_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          id,
          tenantId,
          dto.code.toUpperCase(),
          dto.name,
          dto.parentId || null,
          dto.defaultValuationMethod || 'wac',
          dto.glInventoryAccountId || null,
          dto.glCogsAccountId || null,
          dto.glExpenseAccountId || null,
        ],
      );
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      code: res.code,
      name: res.name,
      parentId: res.parent_id,
      defaultValuationMethod: res.default_valuation_method,
      glInventoryAccountId: res.gl_inventory_account_id,
      glCogsAccountId: res.gl_cogs_account_id,
      glExpenseAccountId: res.gl_expense_account_id,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  async getWarehouses(tenantId: string, branchId: string): Promise<WarehouseDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT * FROM warehouses WHERE tenant_id = $1 AND branch_id = $2 ORDER BY code ASC`,
        [tenantId, branchId],
      );
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      code: r.code,
      name: r.name,
      warehouseType: r.warehouse_type,
      negativeStockPolicy: r.negative_stock_policy,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createWarehouse(tenantId: string, dto: CreateWarehouseDto): Promise<WarehouseDto> {
    const id = crypto.randomUUID();
    const res = await this.db.transaction(tenantId, async (client) => {
      const q = await client.query(
        `INSERT INTO warehouses (
          id, tenant_id, branch_id, code, name, warehouse_type, negative_stock_policy
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          id,
          tenantId,
          dto.branchId,
          dto.code.toUpperCase(),
          dto.name,
          dto.warehouseType || 'central',
          dto.negativeStockPolicy || 'block',
        ],
      );
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      branchId: res.branch_id,
      code: res.code,
      name: res.name,
      warehouseType: res.warehouse_type,
      negativeStockPolicy: res.negative_stock_policy,
      isActive: res.is_active,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  async getSuppliers(tenantId: string): Promise<SupplierDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(`SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY name ASC`, [tenantId]);
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      code: r.code,
      name: r.name,
      contactPerson: r.contact_person,
      email: r.email,
      phone: r.phone,
      taxId: r.tax_id,
      paymentTermsDays: r.payment_terms_days,
      currency: r.currency,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createSupplier(tenantId: string, dto: CreateSupplierDto): Promise<SupplierDto> {
    const id = crypto.randomUUID();
    const res = await this.db.transaction(tenantId, async (client) => {
      const q = await client.query(
        `INSERT INTO suppliers (
          id, tenant_id, code, name, contact_person, email, phone, tax_id, payment_terms_days, currency
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          id,
          tenantId,
          dto.code.toUpperCase(),
          dto.name,
          dto.contactPerson || null,
          dto.email || null,
          dto.phone || null,
          dto.taxId || null,
          dto.paymentTermsDays ?? 30,
          dto.currency || 'USD',
        ],
      );
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      code: res.code,
      name: res.name,
      contactPerson: res.contact_person,
      email: res.email,
      phone: res.phone,
      taxId: res.tax_id,
      paymentTermsDays: res.payment_terms_days,
      currency: res.currency,
      isActive: res.is_active,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  async getItems(tenantId: string, categoryId?: string, search?: string): Promise<ItemDto[]> {
    let sql = `
      SELECT i.*, ic.name as category_name, u.code as base_uom_code
      FROM items i
      JOIN item_categories ic ON ic.id = i.category_id
      JOIN uoms u ON u.id = i.base_uom_id
      WHERE i.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (categoryId) {
      params.push(categoryId);
      sql += ` AND i.category_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (i.name ILIKE $${params.length} OR i.code ILIKE $${params.length})`;
    }

    sql += ` ORDER BY i.code ASC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => this.mapItemRow(r));
  }

  async getItemById(tenantId: string, id: string): Promise<ItemDto> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `SELECT i.*, ic.name as category_name, u.code as base_uom_code
         FROM items i
         JOIN item_categories ic ON ic.id = i.category_id
         JOIN uoms u ON u.id = i.base_uom_id
         WHERE i.id = $1 AND i.tenant_id = $2`,
        [id, tenantId],
      );
      if (q.rows.length === 0) throw new NotFoundException(`Item ${id} not found`);
      return q.rows[0];
    });
    return this.mapItemRow(res);
  }

  async createItem(tenantId: string, dto: CreateItemDto): Promise<ItemDto> {
    const id = crypto.randomUUID();
    const res = await this.db.transaction(tenantId, async (client) => {
      const q = await client.query(
        `INSERT INTO items (
          id, tenant_id, category_id, code, name, description,
          base_uom_id, purchase_uom_id, valuation_method, standard_cost,
          min_stock_level, max_stock_level, reorder_point, reorder_qty, is_perishable
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          id,
          tenantId,
          dto.categoryId,
          dto.code.toUpperCase(),
          dto.name,
          dto.description || null,
          dto.baseUomId,
          dto.purchaseUomId || null,
          dto.valuationMethod || 'wac',
          dto.standardCost || 0,
          dto.minStockLevel || 0,
          dto.maxStockLevel || null,
          dto.reorderPoint || 0,
          dto.reorderQty || 0,
          dto.isPerishable ?? false,
        ],
      );
      return q.rows[0];
    });
    return this.getItemById(tenantId, res.id);
  }

  // ==========================================================================
  // 2. Core Stock Movement & WAC Engine (REQ-INV-004..007)
  // Serialized row lock via SELECT ... FOR UPDATE on stock_balances
  // ==========================================================================

  async applyStockMovement(
    client: pg.PoolClient,
    tenantId: string,
    branchId: string,
    params: {
      warehouseId: string;
      itemId: string;
      postingDate: string;
      docType: 'grn' | 'issue' | 'transfer_out' | 'transfer_in' | 'adjustment' | 'waste' | 'count_variance' | 'minibar_depletion' | 'fnb_pos' | 'fnb_void';
      docId: string;
      docLineId?: string;
      docNo?: string;
      qtyDelta: number;
      unitCost: number; // for receipts: purchase cost; for issues: 0 (calculated via WAC)
      batchNo?: string;
      expiryDate?: string;
    },
  ): Promise<{
    ledgerEntryId: string;
    valueDelta: number;
    issueRate: number;
    newBalanceQty: number;
    newBalanceValue: number;
    newValuationRate: number;
  }> {
    // 1. Ensure stock_balances row exists, then lock FOR UPDATE
    await client.query(
      `INSERT INTO stock_balances (
        id, tenant_id, branch_id, warehouse_id, item_id,
        balance_qty, balance_value, valuation_rate, last_cost, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 0.0000, 0.0000, 0.000000, 0.000000, now())
      ON CONFLICT (tenant_id, warehouse_id, item_id) DO NOTHING`,
      [crypto.randomUUID(), tenantId, branchId, params.warehouseId, params.itemId],
    );

    const balRes = await client.query(
      `SELECT * FROM stock_balances
       WHERE tenant_id = $1 AND warehouse_id = $2 AND item_id = $3
       FOR UPDATE`,
      [tenantId, params.warehouseId, params.itemId],
    );
    const balance = balRes.rows[0];

    // 2. Check Warehouse Negative Stock Policy
    const whRes = await client.query(`SELECT negative_stock_policy FROM warehouses WHERE id = $1`, [params.warehouseId]);
    const policy = whRes.rows[0]?.negative_stock_policy || 'block';

    const currentQty = Number(balance.balance_qty);
    const currentValue = Number(balance.balance_value);
    const currentRate = Number(balance.valuation_rate);
    const currentLastCost = Number(balance.last_cost);

    const targetQty = Math.round((currentQty + params.qtyDelta) * 10000) / 10000;

    if (targetQty < -0.0001 && policy === 'block') {
      const itmRes = await client.query(`SELECT code, name FROM items WHERE id = $1`, [params.itemId]);
      const itm = itmRes.rows[0];
      throw new BadRequestException(
        `Negative stock blocked: Item ${itm?.code || params.itemId} has current balance of ${currentQty}, cannot issue ${Math.abs(params.qtyDelta)} (Warehouse policy: block)`,
      );
    }

    // 3. WAC Mathematics (REQ-INV-005)
    let valueDelta = 0;
    let issueRate = 0;
    let newBalanceQty = targetQty;
    let newBalanceValue = 0;
    let newValuationRate = 0;
    let newLastCost = currentLastCost;

    if (params.qtyDelta > 0) {
      // Receipt (GRN / Transfer In / Positive Adjustment)
      const inCost = params.unitCost;
      valueDelta = Math.round(params.qtyDelta * inCost * 10000) / 10000;
      newBalanceValue = Math.round((currentValue + valueDelta) * 10000) / 10000;

      if (newBalanceQty > 0) {
        newValuationRate = Math.round((newBalanceValue / newBalanceQty) * 1000000) / 1000000;
      } else {
        newValuationRate = inCost;
      }
      newLastCost = inCost;
      issueRate = inCost;
    } else {
      // Issue / Outward (Issue / Transfer Out / Waste / Count Shortage)
      const outQty = Math.abs(params.qtyDelta);
      // Use current valuation rate, or fall back to last cost or standard cost
      let effectiveRate = currentRate;
      if (effectiveRate <= 0) {
        effectiveRate = currentLastCost > 0 ? currentLastCost : params.unitCost;
      }
      issueRate = effectiveRate;
      valueDelta = -Math.round(outQty * effectiveRate * 10000) / 10000;
      newBalanceValue = Math.round((currentValue + valueDelta) * 10000) / 10000;

      // Rate remains unchanged on issue unless quantity drops to zero
      if (newBalanceQty > 0) {
        newValuationRate = currentRate > 0 ? currentRate : effectiveRate;
      } else {
        newValuationRate = currentRate > 0 ? currentRate : 0;
        newBalanceValue = 0; // prevent micro rounding residuals when empty
      }
    }

    // 4. Update stock_balances cache
    await client.query(
      `UPDATE stock_balances
       SET balance_qty = $1, balance_value = $2, valuation_rate = $3, last_cost = $4, updated_at = now()
       WHERE id = $5`,
      [newBalanceQty, newBalanceValue, newValuationRate, newLastCost, balance.id],
    );

    // 5. Append to stock_ledger (Audit Trail)
    const ledgerId = crypto.randomUUID();
    await client.query(
      `INSERT INTO stock_ledger (
        id, tenant_id, branch_id, warehouse_id, item_id, posting_date,
        doc_type, doc_id, doc_line_id, doc_no, qty_delta, unit_cost, value_delta,
        balance_qty, balance_value, valuation_rate, batch_no, expiry_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        ledgerId,
        tenantId,
        branchId,
        params.warehouseId,
        params.itemId,
        params.postingDate,
        params.docType,
        params.docId,
        params.docLineId || null,
        params.docNo || null,
        params.qtyDelta,
        params.qtyDelta > 0 ? params.unitCost : issueRate,
        valueDelta,
        newBalanceQty,
        newBalanceValue,
        newValuationRate,
        params.batchNo || null,
        params.expiryDate || null,
      ],
    );

    return {
      ledgerEntryId: ledgerId,
      valueDelta,
      issueRate,
      newBalanceQty,
      newBalanceValue,
      newValuationRate,
    };
  }

  // ==========================================================================
  // 3. Purchase Orders (PO)
  // ==========================================================================

  async getPurchaseOrders(tenantId: string, branchId: string, status?: string): Promise<PurchaseOrderDto[]> {
    let sql = `
      SELECT po.*, s.name as supplier_name, w.name as warehouse_name
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      JOIN warehouses w ON w.id = po.warehouse_id
      WHERE po.tenant_id = $1 AND po.branch_id = $2
    `;
    const params: any[] = [tenantId, branchId];
    if (status) {
      params.push(status);
      sql += ` AND po.status = $${params.length}`;
    }
    sql += ` ORDER BY po.order_date DESC, po.created_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      poNo: r.po_no,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      orderDate: formatDateOnly(r.order_date),
      expectedDeliveryDate: r.expected_delivery_date ? formatDateOnly(r.expected_delivery_date) : null,
      status: r.status,
      currency: r.currency,
      subtotal: Number(r.subtotal),
      taxAmount: Number(r.tax_amount),
      totalAmount: Number(r.total_amount),
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createPurchaseOrder(tenantId: string, dto: CreatePurchaseOrderDto, userId?: string): Promise<PurchaseOrderDto> {
    return this.db.transaction(tenantId, async (client) => {
      const poNo = await this.generateNextDocNo(client, tenantId, dto.branchId, 'purchase_order', 'PO');
      const poId = crypto.randomUUID();

      let subtotal = 0;
      for (const line of dto.lines) {
        subtotal += Number(line.qtyOrdered) * Number(line.unitPrice);
      }
      subtotal = Math.round(subtotal * 10000) / 10000;
      const taxAmount = Math.round(subtotal * 0.12 * 10000) / 10000;
      const totalAmount = Math.round((subtotal + taxAmount) * 10000) / 10000;

      await client.query(
        `INSERT INTO purchase_orders (
          id, tenant_id, branch_id, po_no, supplier_id, warehouse_id,
          order_date, expected_delivery_date, status, currency,
          subtotal, tax_amount, total_amount, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9, $10, $11, $12, $13, $14)`,
        [
          poId,
          tenantId,
          dto.branchId,
          poNo,
          dto.supplierId,
          dto.warehouseId,
          dto.orderDate,
          dto.expectedDeliveryDate || null,
          dto.currency || 'USD',
          subtotal,
          taxAmount,
          totalAmount,
          dto.notes || null,
          userId || null,
        ],
      );

      let lineNo = 1;
      for (const line of dto.lines) {
        const linePrice = Math.round(Number(line.qtyOrdered) * Number(line.unitPrice) * 10000) / 10000;
        await client.query(
          `INSERT INTO po_lines (
            id, tenant_id, po_id, line_no, item_id, uom_id, qty_ordered, qty_received, unit_price, total_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)`,
          [
            crypto.randomUUID(),
            tenantId,
            poId,
            lineNo++,
            line.itemId,
            line.uomId,
            line.qtyOrdered,
            line.unitPrice,
            linePrice,
          ],
        );
      }

      const poRes = await client.query(
        `SELECT po.*, s.name as supplier_name, w.name as warehouse_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         JOIN warehouses w ON w.id = po.warehouse_id
         WHERE po.id = $1`,
        [poId],
      );
      const r = poRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        poNo: r.po_no,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        orderDate: formatDateOnly(r.order_date),
        expectedDeliveryDate: r.expected_delivery_date ? formatDateOnly(r.expected_delivery_date) : null,
        status: r.status,
        currency: r.currency,
        subtotal: Number(r.subtotal),
        taxAmount: Number(r.tax_amount),
        totalAmount: Number(r.total_amount),
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  // ==========================================================================
  // 4. Goods Receipt Notes (GRN - REQ-INV-003)
  // Increases Stock & Posts Balanced Voucher Dr Inventory / Cr GRNI
  // ==========================================================================

  async getGoodsReceiptNotes(tenantId: string, branchId: string, warehouseId?: string): Promise<GoodsReceiptNoteDto[]> {
    let sql = `
      SELECT grn.*, s.name as supplier_name, w.name as warehouse_name, v.voucher_no
      FROM goods_receipt_notes grn
      JOIN suppliers s ON s.id = grn.supplier_id
      JOIN warehouses w ON w.id = grn.warehouse_id
      LEFT JOIN vouchers v ON v.id = grn.voucher_id
      WHERE grn.tenant_id = $1 AND grn.branch_id = $2
    `;
    const params: any[] = [tenantId, branchId];
    if (warehouseId) {
      params.push(warehouseId);
      sql += ` AND grn.warehouse_id = $${params.length}`;
    }
    sql += ` ORDER BY grn.receipt_date DESC, grn.created_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      grnNo: r.grn_no,
      poId: r.po_id,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      receiptDate: formatDateOnly(r.receipt_date),
      status: r.status,
      supplierInvoiceNo: r.supplier_invoice_no,
      totalAmount: Number(r.total_amount),
      voucherId: r.voucher_id,
      voucherNo: r.voucher_no,
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async getGrnById(tenantId: string, id: string, existingClient?: pg.PoolClient): Promise<GoodsReceiptNoteDto> {
    const run = async (client: pg.PoolClient) => {
      const q = await client.query(
        `SELECT grn.*, s.name as supplier_name, w.name as warehouse_name, v.voucher_no
         FROM goods_receipt_notes grn
         JOIN suppliers s ON s.id = grn.supplier_id
         JOIN warehouses w ON w.id = grn.warehouse_id
         LEFT JOIN vouchers v ON v.id = grn.voucher_id
         WHERE grn.id = $1 AND grn.tenant_id = $2`,
        [id, tenantId],
      );
      if (q.rows.length === 0) throw new NotFoundException(`GRN ${id} not found`);

      const linesQ = await client.query(
        `SELECT gl.*, i.code as item_code, i.name as item_name, u.code as uom_code
         FROM grn_lines gl
         JOIN items i ON i.id = gl.item_id
         JOIN uoms u ON u.id = gl.uom_id
         WHERE gl.grn_id = $1 AND gl.tenant_id = $2
         ORDER BY gl.line_no ASC`,
        [id, tenantId],
      );

      return {
        grn: q.rows[0],
        lines: linesQ.rows,
      };
    };

    const res = existingClient ? await run(existingClient) : await this.db.withTenantConnection(tenantId, undefined, run);

    const g = res.grn;
    return {
      id: g.id,
      tenantId: g.tenant_id,
      branchId: g.branch_id,
      grnNo: g.grn_no,
      poId: g.po_id,
      supplierId: g.supplier_id,
      supplierName: g.supplier_name,
      warehouseId: g.warehouse_id,
      warehouseName: g.warehouse_name,
      receiptDate: formatDateOnly(g.receipt_date),
      status: g.status,
      supplierInvoiceNo: g.supplier_invoice_no,
      totalAmount: Number(g.total_amount),
      voucherId: g.voucher_id,
      voucherNo: g.voucher_no,
      notes: g.notes,
      createdAt: new Date(g.created_at).toISOString(),
      lines: res.lines.map((l: any) => ({
        id: l.id,
        lineNo: l.line_no,
        itemId: l.item_id,
        itemCode: l.item_code,
        itemName: l.item_name,
        uomId: l.uom_id,
        uomCode: l.uom_code,
        qtyReceived: Number(l.qty_received),
        unitCost: Number(l.unit_cost),
        totalCost: Number(l.total_cost),
        batchNo: l.batch_no,
        expiryDate: l.expiry_date ? formatDateOnly(l.expiry_date) : null,
      })),
    };
  }

  async createGrn(tenantId: string, dto: CreateGrnDto, userId?: string): Promise<GoodsReceiptNoteDto> {
    return this.db.transaction(tenantId, async (client) => {
      const grnNo = await this.generateNextDocNo(client, tenantId, dto.branchId, 'goods_receipt_note', 'GRN');
      const grnId = crypto.randomUUID();

      let totalAmount = 0;
      for (const line of dto.lines) {
        totalAmount += Number(line.qtyReceived) * Number(line.unitCost);
      }
      totalAmount = Math.round(totalAmount * 10000) / 10000;

      // 1. Insert GRN Header
      await client.query(
        `INSERT INTO goods_receipt_notes (
          id, tenant_id, branch_id, grn_no, po_id, supplier_id, warehouse_id,
          receipt_date, status, supplier_invoice_no, total_amount, notes, received_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'received', $9, $10, $11, $12)`,
        [
          grnId,
          tenantId,
          dto.branchId,
          grnNo,
          dto.poId || null,
          dto.supplierId,
          dto.warehouseId,
          dto.receiptDate,
          dto.supplierInvoiceNo || null,
          totalAmount,
          dto.notes || null,
          userId || null,
        ],
      );

      // 2. Insert Lines & Apply Stock Movements (WAC update)
      let lineNo = 1;
      for (const line of dto.lines) {
        const lineId = crypto.randomUUID();
        const lineCost = Math.round(Number(line.qtyReceived) * Number(line.unitCost) * 10000) / 10000;

        await client.query(
          `INSERT INTO grn_lines (
            id, tenant_id, grn_id, po_line_id, line_no, item_id, uom_id,
            qty_received, unit_cost, total_cost, batch_no, expiry_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            lineId,
            tenantId,
            grnId,
            line.poLineId || null,
            lineNo++,
            line.itemId,
            line.uomId,
            line.qtyReceived,
            line.unitCost,
            lineCost,
            line.batchNo || null,
            line.expiryDate || null,
          ],
        );

        // Update Stock Balances & Ledger
        await this.applyStockMovement(client, tenantId, dto.branchId, {
          warehouseId: dto.warehouseId,
          itemId: line.itemId,
          postingDate: dto.receiptDate,
          docType: 'grn',
          docId: grnId,
          docLineId: lineId,
          docNo: grnNo,
          qtyDelta: Number(line.qtyReceived),
          unitCost: Number(line.unitCost),
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
        });

        // Update item last purchase price
        await client.query(`UPDATE items SET last_purchase_price = $1, updated_at = now() WHERE id = $2`, [
          line.unitCost,
          line.itemId,
        ]);
      }

      // 3. Automated Accounting Voucher Posting: Dr Inventory / Cr GRNI
      let voucherId: string | null = null;
      try {
        const voucher = await this.accountingService.postOperationalEvent(
          tenantId,
          dto.branchId,
          'inventory.grn',
          {
            date: dto.receiptDate,
            description: `Goods Receipt Note ${grnNo} - Supplier Invoice ${dto.supplierInvoiceNo || 'Direct'}`,
            grossAmount: totalAmount,
            sourceType: 'grn',
            sourceId: grnId,
            partyType: 'supplier',
            partyId: dto.supplierId,
          },
          client,
        );
        voucherId = voucher.id;
        await client.query(`UPDATE goods_receipt_notes SET voucher_id = $1 WHERE id = $2`, [voucherId, grnId]);
      } catch (err: any) {
        // If posting rule isn't configured, log warning but allow movement to proceed
        console.warn(`[InventoryService] GRN accounting voucher posting skipped: ${err.message}`);
      }

      return this.getGrnById(tenantId, grnId, client);
    });
  }

  // ==========================================================================
  // 5. Material Issues (Department Requisitions)
  // Depletes Stock at WAC & Posts Dr Department Expense / Cr Inventory
  // ==========================================================================

  async getStockIssues(tenantId: string, branchId: string): Promise<StockIssueDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT si.*, w.name as warehouse_name, v.voucher_no
         FROM stock_issues si
         JOIN warehouses w ON w.id = si.warehouse_id
         LEFT JOIN vouchers v ON v.id = si.voucher_id
         WHERE si.tenant_id = $1 AND si.branch_id = $2
         ORDER BY si.issue_date DESC, si.created_at DESC`,
        [tenantId, branchId],
      );
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      issueNo: r.issue_no,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      issueDate: formatDateOnly(r.issue_date),
      department: r.department,
      status: r.status,
      totalValue: Number(r.total_value),
      voucherId: r.voucher_id,
      voucherNo: r.voucher_no,
      requestedBy: r.requested_by,
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createStockIssue(tenantId: string, dto: CreateStockIssueDto, userId?: string): Promise<StockIssueDto> {
    return this.db.transaction(tenantId, async (client) => {
      const issueNo = await this.generateNextDocNo(client, tenantId, dto.branchId, 'stock_issue', 'ISS');
      const issueId = crypto.randomUUID();

      // 1. Insert Issue Header
      await client.query(
        `INSERT INTO stock_issues (
          id, tenant_id, branch_id, issue_no, warehouse_id, issue_date,
          department, status, total_value, requested_by, issued_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'issued', 0.0000, $8, $9, $10)`,
        [
          issueId,
          tenantId,
          dto.branchId,
          issueNo,
          dto.warehouseId,
          dto.issueDate,
          dto.department,
          dto.requestedBy || null,
          userId || null,
          dto.notes || null,
        ],
      );

      // 2. Insert Lines and execute outward movements at current WAC
      let totalValue = 0;
      let lineNo = 1;
      for (const line of dto.lines) {
        const lineId = crypto.randomUUID();
        const movement = await this.applyStockMovement(client, tenantId, dto.branchId, {
          warehouseId: dto.warehouseId,
          itemId: line.itemId,
          postingDate: dto.issueDate,
          docType: 'issue',
          docId: issueId,
          docLineId: lineId,
          docNo: issueNo,
          qtyDelta: -Math.abs(Number(line.qty)),
          unitCost: 0, // will use current WAC rate
        });

        const lineCost = Math.abs(movement.valueDelta);
        totalValue += lineCost;

        await client.query(
          `INSERT INTO stock_issue_lines (
            id, tenant_id, issue_id, line_no, item_id, qty, unit_cost, total_cost, remarks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            lineId,
            tenantId,
            issueId,
            lineNo++,
            line.itemId,
            line.qty,
            movement.issueRate,
            lineCost,
            line.remarks || null,
          ],
        );
      }

      totalValue = Math.round(totalValue * 10000) / 10000;
      await client.query(`UPDATE stock_issues SET total_value = $1 WHERE id = $2`, [totalValue, issueId]);

      // 3. Automated Accounting Voucher Posting: Dr Department Expense / Cr Inventory
      try {
        const voucher = await this.accountingService.postOperationalEvent(
          tenantId,
          dto.branchId,
          'inventory.issue',
          {
            date: dto.issueDate,
            description: `Material Issue ${issueNo} - Department Requisition (${dto.department})`,
            grossAmount: totalValue,
            sourceType: 'stock_issue',
            sourceId: issueId,
          },
          client,
        );
        await client.query(`UPDATE stock_issues SET voucher_id = $1 WHERE id = $2`, [voucher.id, issueId]);
      } catch (err: any) {
        console.warn(`[InventoryService] Stock issue accounting voucher posting skipped: ${err.message}`);
      }

      const siRes = await client.query(
        `SELECT si.*, w.name as warehouse_name, v.voucher_no
         FROM stock_issues si
         JOIN warehouses w ON w.id = si.warehouse_id
         LEFT JOIN vouchers v ON v.id = si.voucher_id
         WHERE si.id = $1`,
        [issueId],
      );
      const r = siRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        issueNo: r.issue_no,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        issueDate: formatDateOnly(r.issue_date),
        department: r.department,
        status: r.status,
        totalValue: Number(r.total_value),
        voucherId: r.voucher_id,
        voucherNo: r.voucher_no,
        requestedBy: r.requested_by,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  // ==========================================================================
  // 6. Stock Transfers (Inter-Warehouse Transfers)
  // Transfers Stock between Warehouses at Source WAC Rate
  // ==========================================================================

  async getStockTransfers(tenantId: string, branchId: string): Promise<StockTransferDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT st.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name
         FROM stock_transfers st
         JOIN warehouses fw ON fw.id = st.from_warehouse_id
         JOIN warehouses tw ON tw.id = st.to_warehouse_id
         WHERE st.tenant_id = $1 AND st.branch_id = $2
         ORDER BY st.transfer_date DESC, st.created_at DESC`,
        [tenantId, branchId],
      );
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      transferNo: r.transfer_no,
      fromWarehouseId: r.from_warehouse_id,
      fromWarehouseName: r.from_warehouse_name,
      toWarehouseId: r.to_warehouse_id,
      toWarehouseName: r.to_warehouse_name,
      transferDate: formatDateOnly(r.transfer_date),
      status: r.status,
      totalValue: Number(r.total_value),
      voucherId: r.voucher_id,
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createStockTransfer(tenantId: string, dto: CreateStockTransferDto, userId?: string): Promise<StockTransferDto> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses cannot be the same');
    }

    return this.db.transaction(tenantId, async (client) => {
      const transferNo = await this.generateNextDocNo(client, tenantId, dto.branchId, 'stock_transfer', 'TRF');
      const transferId = crypto.randomUUID();

      await client.query(
        `INSERT INTO stock_transfers (
          id, tenant_id, branch_id, transfer_no, from_warehouse_id, to_warehouse_id,
          transfer_date, status, total_value, created_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', 0.0000, $8, $9)`,
        [
          transferId,
          tenantId,
          dto.branchId,
          transferNo,
          dto.fromWarehouseId,
          dto.toWarehouseId,
          dto.transferDate,
          userId || null,
          dto.notes || null,
        ],
      );

      let totalValue = 0;
      let lineNo = 1;
      for (const line of dto.lines) {
        const lineId = crypto.randomUUID();

        // 1. Issue out from Source Warehouse at WAC
        const outMovement = await this.applyStockMovement(client, tenantId, dto.branchId, {
          warehouseId: dto.fromWarehouseId,
          itemId: line.itemId,
          postingDate: dto.transferDate,
          docType: 'transfer_out',
          docId: transferId,
          docLineId: lineId,
          docNo: transferNo,
          qtyDelta: -Math.abs(Number(line.qty)),
          unitCost: 0,
        });

        const lineCost = Math.abs(outMovement.valueDelta);
        totalValue += lineCost;

        // 2. Receive into Destination Warehouse at the exact same outCost
        await this.applyStockMovement(client, tenantId, dto.branchId, {
          warehouseId: dto.toWarehouseId,
          itemId: line.itemId,
          postingDate: dto.transferDate,
          docType: 'transfer_in',
          docId: transferId,
          docLineId: lineId,
          docNo: transferNo,
          qtyDelta: Math.abs(Number(line.qty)),
          unitCost: outMovement.issueRate,
        });

        await client.query(
          `INSERT INTO stock_transfer_lines (
            id, tenant_id, transfer_id, line_no, item_id, qty, unit_cost, total_cost
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            lineId,
            tenantId,
            transferId,
            lineNo++,
            line.itemId,
            line.qty,
            outMovement.issueRate,
            lineCost,
          ],
        );
      }

      totalValue = Math.round(totalValue * 10000) / 10000;
      await client.query(`UPDATE stock_transfers SET total_value = $1 WHERE id = $2`, [totalValue, transferId]);

      const trRes = await client.query(
        `SELECT st.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name
         FROM stock_transfers st
         JOIN warehouses fw ON fw.id = st.from_warehouse_id
         JOIN warehouses tw ON tw.id = st.to_warehouse_id
         WHERE st.id = $1`,
        [transferId],
      );
      const r = trRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        transferNo: r.transfer_no,
        fromWarehouseId: r.from_warehouse_id,
        fromWarehouseName: r.from_warehouse_name,
        toWarehouseId: r.to_warehouse_id,
        toWarehouseName: r.to_warehouse_name,
        transferDate: formatDateOnly(r.transfer_date),
        status: r.status,
        totalValue: Number(r.total_value),
        voucherId: r.voucher_id,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  // ==========================================================================
  // 7. Stock Adjustments & Spoilage / Waste
  // Adjusts physical quantity & posts accounting loss / variance
  // ==========================================================================

  async getStockAdjustments(tenantId: string, branchId: string): Promise<StockAdjustmentDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT sa.*, w.name as warehouse_name, v.voucher_no
         FROM stock_adjustments sa
         JOIN warehouses w ON w.id = sa.warehouse_id
         LEFT JOIN vouchers v ON v.id = sa.voucher_id
         WHERE sa.tenant_id = $1 AND sa.branch_id = $2
         ORDER BY sa.adjustment_date DESC, sa.created_at DESC`,
        [tenantId, branchId],
      );
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      adjNo: r.adj_no,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      adjustmentDate: formatDateOnly(r.adjustment_date),
      reason: r.reason,
      status: r.status,
      totalValue: Number(r.total_value),
      voucherId: r.voucher_id,
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createStockAdjustment(tenantId: string, dto: CreateStockAdjustmentDto, userId?: string): Promise<StockAdjustmentDto> {
    return this.db.transaction(tenantId, async (client) => {
      const adjNo = await this.generateNextDocNo(client, tenantId, dto.branchId, 'stock_adjustment', 'ADJ');
      const adjId = crypto.randomUUID();

      await client.query(
        `INSERT INTO stock_adjustments (
          id, tenant_id, branch_id, adj_no, warehouse_id, adjustment_date,
          reason, status, total_value, approved_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'posted', 0.0000, $8, $9)`,
        [
          adjId,
          tenantId,
          dto.branchId,
          adjNo,
          dto.warehouseId,
          dto.adjustmentDate,
          dto.reason,
          userId || null,
          dto.notes || null,
        ],
      );

      let totalNetValue = 0;
      let lineNo = 1;
      for (const line of dto.lines) {
        const lineId = crypto.randomUUID();
        const movement = await this.applyStockMovement(client, tenantId, dto.branchId, {
          warehouseId: dto.warehouseId,
          itemId: line.itemId,
          postingDate: dto.adjustmentDate,
          docType: dto.reason === 'waste' || dto.reason === 'spoilage' ? 'waste' : 'adjustment',
          docId: adjId,
          docLineId: lineId,
          docNo: adjNo,
          qtyDelta: Number(line.qtyDelta),
          unitCost: 0,
        });

        totalNetValue += movement.valueDelta;

        await client.query(
          `INSERT INTO stock_adjustment_lines (
            id, tenant_id, adjustment_id, line_no, item_id, qty_delta, unit_cost, value_delta, remarks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            lineId,
            tenantId,
            adjId,
            lineNo++,
            line.itemId,
            line.qtyDelta,
            movement.issueRate,
            movement.valueDelta,
            line.remarks || null,
          ],
        );
      }

      totalNetValue = Math.round(totalNetValue * 10000) / 10000;
      await client.query(`UPDATE stock_adjustments SET total_value = $1 WHERE id = $2`, [totalNetValue, adjId]);

      // Post accounting voucher for adjustment loss
      if (Math.abs(totalNetValue) > 0.01) {
        try {
          const voucher = await this.accountingService.postOperationalEvent(
            tenantId,
            dto.branchId,
            'inventory.adjustment',
            {
              date: dto.adjustmentDate,
              description: `Stock Adjustment ${adjNo} - ${dto.reason.toUpperCase()}`,
              grossAmount: Math.abs(totalNetValue),
              sourceType: 'stock_adjustment',
              sourceId: adjId,
            },
            client,
          );
          await client.query(`UPDATE stock_adjustments SET voucher_id = $1 WHERE id = $2`, [voucher.id, adjId]);
        } catch (err: any) {
          console.warn(`[InventoryService] Stock adjustment accounting voucher skipped: ${err.message}`);
        }
      }

      const saRes = await client.query(
        `SELECT sa.*, w.name as warehouse_name
         FROM stock_adjustments sa
         JOIN warehouses w ON w.id = sa.warehouse_id
         WHERE sa.id = $1`,
        [adjId],
      );
      const r = saRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        adjNo: r.adj_no,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        adjustmentDate: formatDateOnly(r.adjustment_date),
        reason: r.reason,
        status: r.status,
        totalValue: Number(r.total_value),
        voucherId: r.voucher_id,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  // ==========================================================================
  // 8. Stock Count Audit Workflow (REQ-INV-008)
  // Freeze Snapshot -> Record Counts -> Reconcile Variances
  // ==========================================================================

  async getStockCounts(tenantId: string, branchId: string): Promise<StockCountDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT sc.*, w.name as warehouse_name
         FROM stock_counts sc
         JOIN warehouses w ON w.id = sc.warehouse_id
         WHERE sc.tenant_id = $1 AND sc.branch_id = $2
         ORDER BY sc.count_date DESC, sc.created_at DESC`,
        [tenantId, branchId],
      );
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      countNo: r.count_no,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      countDate: formatDateOnly(r.count_date),
      status: r.status,
      adjustmentId: r.adjustment_id,
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createStockCount(tenantId: string, dto: CreateStockCountDto, userId?: string): Promise<StockCountDto> {
    return this.db.transaction(tenantId, async (client) => {
      const countNo = await this.generateNextDocNo(client, tenantId, dto.branchId, 'stock_count', 'CNT');
      const countId = crypto.randomUUID();

      // 1. Create Stock Count header
      await client.query(
        `INSERT INTO stock_counts (
          id, tenant_id, branch_id, count_no, warehouse_id, count_date,
          status, created_by, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, 'snapshot_frozen', $7, $8)`,
        [countId, tenantId, dto.branchId, countNo, dto.warehouseId, dto.countDate, userId || null, dto.notes || null],
      );

      // 2. Freeze snapshot quantities from current stock_balances
      const itemsRes = await client.query(
        `SELECT i.id as item_id, COALESCE(sb.balance_qty, 0) as balance_qty,
                COALESCE(sb.valuation_rate, i.standard_cost) as valuation_rate,
                COALESCE(sb.balance_value, 0) as balance_value
         FROM items i
         LEFT JOIN stock_balances sb ON sb.item_id = i.id AND sb.warehouse_id = $1
         WHERE i.tenant_id = $2 AND i.is_active = true`,
        [dto.warehouseId, tenantId],
      );

      for (const itm of itemsRes.rows) {
        await client.query(
          `INSERT INTO stock_count_lines (
            id, tenant_id, count_id, item_id, snapshot_qty, snapshot_cost, snapshot_value
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            tenantId,
            countId,
            itm.item_id,
            itm.balance_qty,
            itm.valuation_rate,
            itm.balance_value,
          ],
        );
      }

      const scRes = await client.query(
        `SELECT sc.*, w.name as warehouse_name
         FROM stock_counts sc
         JOIN warehouses w ON w.id = sc.warehouse_id
         WHERE sc.id = $1`,
        [countId],
      );
      const r = scRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        countNo: r.count_no,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        countDate: formatDateOnly(r.count_date),
        status: r.status,
        adjustmentId: r.adjustment_id,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  async recordCountLines(tenantId: string, countId: string, dto: SubmitCountLinesDto): Promise<StockCountDto> {
    return this.db.transaction(tenantId, async (client) => {
      const countRes = await client.query(`SELECT * FROM stock_counts WHERE id = $1 AND tenant_id = $2`, [countId, tenantId]);
      if (countRes.rows.length === 0) throw new NotFoundException(`Stock count ${countId} not found`);

      for (const line of dto.lines) {
        const lineQ = await client.query(
          `SELECT * FROM stock_count_lines WHERE count_id = $1 AND item_id = $2`,
          [countId, line.itemId],
        );
        if (lineQ.rows.length > 0) {
          const snapshotQty = Number(lineQ.rows[0].snapshot_qty);
          const snapshotCost = Number(lineQ.rows[0].snapshot_cost);
          const countedQty = Number(line.countedQty);
          const varianceQty = Math.round((countedQty - snapshotQty) * 10000) / 10000;
          const varianceValue = Math.round(varianceQty * snapshotCost * 10000) / 10000;

          await client.query(
            `UPDATE stock_count_lines
             SET counted_qty = $1, variance_qty = $2, variance_value = $3
             WHERE count_id = $4 AND item_id = $5`,
            [countedQty, varianceQty, varianceValue, countId, line.itemId],
          );
        }
      }

      await client.query(`UPDATE stock_counts SET status = 'counting' WHERE id = $1`, [countId]);

      const scRes = await client.query(
        `SELECT sc.*, w.name as warehouse_name
         FROM stock_counts sc
         JOIN warehouses w ON w.id = sc.warehouse_id
         WHERE sc.id = $1`,
        [countId],
      );
      const r = scRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        countNo: r.count_no,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        countDate: formatDateOnly(r.count_date),
        status: r.status,
        adjustmentId: r.adjustment_id,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  async reconcileCount(tenantId: string, countId: string, userId?: string): Promise<StockCountDto> {
    return this.db.transaction(tenantId, async (client) => {
      const countRes = await client.query(`SELECT * FROM stock_counts WHERE id = $1 AND tenant_id = $2`, [countId, tenantId]);
      if (countRes.rows.length === 0) throw new NotFoundException(`Stock count ${countId} not found`);
      const count = countRes.rows[0];

      if (count.status === 'adjusted') {
        throw new BadRequestException('Stock count has already been reconciled and adjusted');
      }

      const linesRes = await client.query(
        `SELECT * FROM stock_count_lines
         WHERE count_id = $1 AND variance_qty != 0 AND counted_qty IS NOT NULL`,
        [countId],
      );

      // Create automated Stock Adjustment if any variances exist
      let adjustmentId: string | null = null;
      if (linesRes.rows.length > 0) {
        const adjustmentLines = linesRes.rows.map((l: any) => ({
          itemId: l.item_id,
          qtyDelta: Number(l.variance_qty),
          remarks: `Physical count variance adjustment (${count.count_no})`,
        }));

        const adjustment = await this.createStockAdjustment(
          tenantId,
          {
            branchId: count.branch_id,
            warehouseId: count.warehouse_id,
            adjustmentDate: formatDateOnly(count.count_date),
            reason: 'count_reconciliation',
            notes: `Auto-generated reconciliation for Audit Count ${count.count_no}`,
            lines: adjustmentLines,
          },
          userId,
        );
        adjustmentId = adjustment.id;
      }

      await client.query(
        `UPDATE stock_counts
         SET status = 'adjusted', adjustment_id = $1, approved_by = $2
         WHERE id = $3`,
        [adjustmentId, userId || null, countId],
      );

      const scRes = await client.query(
        `SELECT sc.*, w.name as warehouse_name
         FROM stock_counts sc
         JOIN warehouses w ON w.id = sc.warehouse_id
         WHERE sc.id = $1`,
        [countId],
      );
      const r = scRes.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        branchId: r.branch_id,
        countNo: r.count_no,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        countDate: formatDateOnly(r.count_date),
        status: r.status,
        adjustmentId: r.adjustment_id,
        notes: r.notes,
        createdAt: new Date(r.created_at).toISOString(),
      };
    });
  }

  // ==========================================================================
  // 9. Reporting: Stock on Hand & Inventory Valuation vs GL (REQ-INV-010)
  // ==========================================================================

  async getStockOnHand(tenantId: string, branchId: string, warehouseId?: string): Promise<StockBalanceDto[]> {
    let sql = `
      SELECT sb.*, w.name as warehouse_name, i.code as item_code, i.name as item_name, u.code as uom_code
      FROM stock_balances sb
      JOIN warehouses w ON w.id = sb.warehouse_id
      JOIN items i ON i.id = sb.item_id
      JOIN uoms u ON u.id = i.base_uom_id
      WHERE sb.tenant_id = $1 AND sb.branch_id = $2
    `;
    const params: any[] = [tenantId, branchId];
    if (warehouseId) {
      params.push(warehouseId);
      sql += ` AND sb.warehouse_id = $${params.length}`;
    }
    sql += ` ORDER BY w.name ASC, i.code ASC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      itemId: r.item_id,
      itemCode: r.item_code,
      itemName: r.item_name,
      uomCode: r.uom_code,
      balanceQty: Number(r.balance_qty),
      balanceValue: Number(r.balance_value),
      valuationRate: Number(r.valuation_rate),
      lastCost: Number(r.last_cost),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async getInventoryValuationReport(
    tenantId: string,
    branchId: string,
    warehouseId?: string,
  ): Promise<InventoryValuationReportDto> {
    return this.db.withTenantConnection(tenantId, undefined, async (client) => {
      // 1. Calculate physical stock valuation from stock_balances
      let sql = `
        SELECT sb.*, w.name as warehouse_name, i.code as item_code, i.name as item_name,
               ic.name as category_name, u.code as uom_code
        FROM stock_balances sb
        JOIN warehouses w ON w.id = sb.warehouse_id
        JOIN items i ON i.id = sb.item_id
        JOIN item_categories ic ON ic.id = i.category_id
        JOIN uoms u ON u.id = i.base_uom_id
        WHERE sb.tenant_id = $1 AND sb.branch_id = $2
      `;
      const params: any[] = [tenantId, branchId];
      if (warehouseId) {
        params.push(warehouseId);
        sql += ` AND sb.warehouse_id = $${params.length}`;
      }
      sql += ` ORDER BY i.code ASC`;

      const res = await client.query(sql, params);

      let totalValuation = 0;
      const itemsList = res.rows.map((r: any) => {
        const val = Number(r.balance_value);
        totalValuation += val;
        return {
          itemId: r.item_id,
          itemCode: r.item_code,
          itemName: r.item_name,
          categoryName: r.category_name,
          warehouseName: r.warehouse_name,
          uomCode: r.uom_code,
          qty: Number(r.balance_qty),
          valuationRate: Number(r.valuation_rate),
          totalValuation: val,
        };
      });

      totalValuation = Math.round(totalValuation * 100) / 100;

      // 2. Query General Ledger Inventory Asset Accounts (1210 & 1220)
      const glRes = await client.query(
        `SELECT COALESCE(sum(gle.debit - gle.credit), 0)::numeric as gl_balance
         FROM gl_entries gle
         JOIN accounts a ON a.id = gle.account_id
         WHERE gle.tenant_id = $1 AND gle.branch_id = $2
           AND a.code IN ('1210', '1220')`,
        [tenantId, branchId],
      );
      const glBalance = Math.round(Number(glRes.rows[0]?.gl_balance || 0) * 100) / 100;
      const variance = Math.round((totalValuation - glBalance) * 100) / 100;
      const reconciled = Math.abs(variance) < 0.05;

      return {
        branchId,
        warehouseId: warehouseId || null,
        asOfDate: new Date().toISOString().slice(0, 10),
        totalValuation,
        itemsCount: itemsList.length,
        glInventoryAccountBalance: glBalance,
        variance,
        reconciled,
        items: itemsList,
      };
    });
  }

  async getStockLedger(
    tenantId: string,
    branchId: string,
    itemId?: string,
    warehouseId?: string,
  ): Promise<StockLedgerEntryDto[]> {
    let sql = `
      SELECT sl.*, i.code as item_code, i.name as item_name, w.name as warehouse_name
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
      JOIN warehouses w ON w.id = sl.warehouse_id
      WHERE sl.tenant_id = $1 AND sl.branch_id = $2
    `;
    const params: any[] = [tenantId, branchId];
    if (itemId) {
      params.push(itemId);
      sql += ` AND sl.item_id = $${params.length}`;
    }
    if (warehouseId) {
      params.push(warehouseId);
      sql += ` AND sl.warehouse_id = $${params.length}`;
    }
    sql += ` ORDER BY sl.posting_date DESC, sl.created_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      warehouseId: r.warehouse_id,
      itemId: r.item_id,
      postingDate: formatDateOnly(r.posting_date),
      docType: r.doc_type,
      docId: r.doc_id,
      docNo: r.doc_no,
      qtyDelta: Number(r.qty_delta),
      unitCost: Number(r.unit_cost),
      valueDelta: Number(r.value_delta),
      balanceQty: Number(r.balance_qty),
      balanceValue: Number(r.balance_value),
      valuationRate: Number(r.valuation_rate),
      batchNo: r.batch_no,
      expiryDate: r.expiry_date ? formatDateOnly(r.expiry_date) : null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  // ==========================================================================
  // Helper: Gapless Document Number Generator under Row Lock
  // ==========================================================================

  private async generateNextDocNo(
    client: pg.PoolClient,
    tenantId: string,
    branchId: string,
    docType: string,
    prefix: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear().toString();

    let seqRes = await client.query(
      `SELECT id, prefix, pattern, reset_policy, next_no
       FROM numbering_sequences
       WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
         AND doc_type = $3
       FOR UPDATE`,
      [tenantId, branchId, docType],
    );

    if (seqRes.rows.length === 0) {
      const seqId = crypto.randomUUID();
      await client.query(
        `INSERT INTO numbering_sequences (
          id, tenant_id, branch_id, doc_type, prefix, pattern, reset_policy, next_no, is_gapless
        ) VALUES ($1, $2, $3, $4, $5, '{PREFIX}-{YYYY}-{#6}', 'yearly', 1, true)
        ON CONFLICT (tenant_id, branch_id, doc_type) DO UPDATE SET next_no = numbering_sequences.next_no`,
        [seqId, tenantId, branchId, docType, prefix],
      );

      seqRes = await client.query(
        `SELECT id, prefix, pattern, reset_policy, next_no
         FROM numbering_sequences
         WHERE tenant_id = $1 AND (branch_id = $2 OR branch_id IS NULL)
           AND doc_type = $3
         FOR UPDATE`,
        [tenantId, branchId, docType],
      );
    }

    const seq = seqRes.rows[0];
    let currentNo = Number(seq.next_no);
    let docNumber = '';

    while (true) {
      let candidate = (seq.pattern || '{PREFIX}-{YYYY}-{#6}')
        .replace('{PREFIX}', seq.prefix || prefix)
        .replace('{YYYY}', year);

      const padMatch = candidate.match(/\{#(\d+)\}/);
      if (padMatch) {
        const digits = parseInt(padMatch[1], 10);
        candidate = candidate.replace(padMatch[0], String(currentNo).padStart(digits, '0'));
      } else {
        candidate = candidate.replace('{#}', String(currentNo));
      }

      let table = 'goods_receipt_notes';
      let col = 'grn_no';
      if (docType === 'purchase_order') { table = 'purchase_orders'; col = 'po_no'; }
      else if (docType === 'stock_issue') { table = 'stock_issues'; col = 'issue_no'; }
      else if (docType === 'stock_transfer') { table = 'stock_transfers'; col = 'transfer_no'; }
      else if (docType === 'stock_adjustment') { table = 'stock_adjustments'; col = 'adj_no'; }
      else if (docType === 'stock_count') { table = 'stock_counts'; col = 'count_no'; }

      const existCheck = await client.query(
        `SELECT 1 FROM ${table} WHERE tenant_id = $1 AND branch_id = $2 AND ${col} = $3`,
        [tenantId, branchId, candidate],
      );
      if (existCheck.rows.length === 0) {
        docNumber = candidate;
        break;
      }
      currentNo++;
    }

    const nextNo = currentNo + 1;
    await client.query(
      `UPDATE numbering_sequences
       SET next_no = $1
       WHERE id = $2 AND tenant_id = $3`,
      [nextNo, seq.id, tenantId],
    );

    return docNumber;
  }

  private mapItemRow(r: any): ItemDto {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      code: r.code,
      name: r.name,
      description: r.description,
      baseUomId: r.base_uom_id,
      baseUomCode: r.base_uom_code,
      purchaseUomId: r.purchase_uom_id,
      valuationMethod: r.valuation_method,
      standardCost: Number(r.standard_cost),
      lastPurchasePrice: Number(r.last_purchase_price),
      minStockLevel: Number(r.min_stock_level),
      maxStockLevel: r.max_stock_level ? Number(r.max_stock_level) : null,
      reorderPoint: Number(r.reorder_point),
      reorderQty: Number(r.reorder_qty),
      isPerishable: r.is_perishable,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }
}
