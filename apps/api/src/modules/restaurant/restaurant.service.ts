import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import pg from 'pg';
import { DatabaseService } from '../../kernel/database/database.service.js';
import { FoliosService } from '../folios/folios.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { AccountingService } from '../accounting/accounting.service.js';
import {
  type CreateOutletDto,
  type OutletDto,
  type CreateKitchenStationDto,
  type KitchenStationDto,
  type CreateDiningTableDto,
  type DiningTableDto,
  type CreateMenuCategoryDto,
  type MenuCategoryDto,
  type CreateMenuItemDto,
  type MenuItemDto,
  type CreateRecipeDto,
  type RecipeDto,
  type OpenShiftDto,
  type CloseShiftDto,
  type PosShiftDto,
  type CreatePosOrderDto,
  type AddOrderLinesDto,
  type VoidOrderLineDto,
  type PosOrderDto,
  type FireKotDto,
  type KotDto,
  type CreateBillDto,
  type SettleBillDto,
  type PosBillDto,
  type InHouseGuestLookupDto,
} from '@innkeeper/contracts';

function formatDateOnly(d: any): string {
  if (!d) return '';
  if (typeof d === 'string') return d.split('T')[0];
  const date = new Date(d);
  return date.toISOString().split('T')[0];
}

@Injectable()
export class RestaurantService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(FoliosService) private readonly foliosService: FoliosService,
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
    @Inject(AccountingService) private readonly accountingService: AccountingService,
  ) {}

  private async generateNextDocNo(
    client: pg.PoolClient,
    tenantId: string,
    branchId: string,
    docType: string,
    prefix: string,
  ): Promise<string> {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const seqRes = await client.query(
      `SELECT count(*) as count FROM pos_orders WHERE tenant_id = $1 AND branch_id = $2 AND created_at::date = CURRENT_DATE`,
      [tenantId, branchId],
    );
    const count = parseInt(seqRes.rows[0]?.count || '0', 10) + 1;
    const pad = count.toString().padStart(4, '0');
    return `${prefix}-${today}-${pad}`;
  }

  // ==========================================================================
  // 1. OUTLETS & STATIONS & TABLES
  // ==========================================================================

  async getOutlets(tenantId: string, branchId: string): Promise<OutletDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT o.*, w.name as warehouse_name
         FROM outlets o
         LEFT JOIN warehouses w ON w.id = o.warehouse_id
         WHERE o.tenant_id = $1 AND o.branch_id = $2
         ORDER BY o.code ASC`,
        [tenantId, branchId],
      );
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      code: r.code,
      name: r.name,
      outletType: r.outlet_type,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      depletionMode: r.depletion_mode,
      operatingHours: r.operating_hours,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createOutlet(tenantId: string, dto: CreateOutletDto): Promise<OutletDto> {
    const id = crypto.randomUUID();
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `INSERT INTO outlets (
          id, tenant_id, branch_id, code, name, outlet_type, warehouse_id, depletion_mode, operating_hours, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          id,
          tenantId,
          dto.branchId,
          dto.code.toUpperCase(),
          dto.name,
          dto.outletType || 'restaurant',
          dto.warehouseId || null,
          dto.depletionMode || 'at_settle',
          JSON.stringify(dto.operatingHours || { open: '06:00', close: '23:00' }),
          dto.isActive !== false,
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
      outletType: res.outlet_type,
      warehouseId: res.warehouse_id,
      depletionMode: res.depletion_mode,
      operatingHours: res.operating_hours,
      isActive: res.is_active,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  async getKitchenStations(tenantId: string, outletId: string): Promise<KitchenStationDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT * FROM kitchen_stations WHERE tenant_id = $1 AND outlet_id = $2 ORDER BY code ASC`,
        [tenantId, outletId],
      );
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      outletId: r.outlet_id,
      code: r.code,
      name: r.name,
      printerIp: r.printer_ip,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createKitchenStation(tenantId: string, dto: CreateKitchenStationDto): Promise<KitchenStationDto> {
    const id = crypto.randomUUID();
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `INSERT INTO kitchen_stations (id, tenant_id, outlet_id, code, name, printer_ip)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, tenantId, dto.outletId, dto.code.toUpperCase(), dto.name, dto.printerIp || null],
      );
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      outletId: res.outlet_id,
      code: res.code,
      name: res.name,
      printerIp: res.printer_ip,
      isActive: res.is_active,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  async getDiningTables(tenantId: string, outletId: string): Promise<DiningTableDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT * FROM dining_tables WHERE tenant_id = $1 AND outlet_id = $2 ORDER BY table_number ASC`,
        [tenantId, outletId],
      );
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      outletId: r.outlet_id,
      tableNumber: r.table_number,
      name: r.name,
      section: r.section,
      capacity: r.capacity,
      status: r.status,
      currentOrderId: r.current_order_id,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createDiningTable(tenantId: string, dto: CreateDiningTableDto): Promise<DiningTableDto> {
    const id = crypto.randomUUID();
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `INSERT INTO dining_tables (id, tenant_id, outlet_id, table_number, name, section, capacity, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'free')
         RETURNING *`,
        [id, tenantId, dto.outletId, dto.tableNumber.toUpperCase(), dto.name, dto.section || 'Main Dining', dto.capacity || 4],
      );
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      outletId: res.outlet_id,
      tableNumber: res.table_number,
      name: res.name,
      section: res.section,
      capacity: res.capacity,
      status: res.status,
      currentOrderId: res.current_order_id,
      isActive: res.is_active,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  async updateTableStatus(
    tenantId: string,
    tableId: string,
    status: 'free' | 'seated' | 'ordered' | 'billed' | 'dirty',
  ): Promise<DiningTableDto> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `UPDATE dining_tables SET status = $1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [status, tableId, tenantId],
      );
      if (q.rows.length === 0) throw new NotFoundException(`Table ${tableId} not found`);
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      outletId: res.outlet_id,
      tableNumber: res.table_number,
      name: res.name,
      section: res.section,
      capacity: res.capacity,
      status: res.status,
      currentOrderId: res.current_order_id,
      isActive: res.is_active,
      createdAt: new Date(res.created_at).toISOString(),
    };
  }

  // ==========================================================================
  // 2. MENU CATEGORIES, ITEMS & RECIPES (BOM)
  // ==========================================================================

  async getMenuCategories(tenantId: string, outletId: string): Promise<MenuCategoryDto[]> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT * FROM menu_categories WHERE tenant_id = $1 AND outlet_id = $2 ORDER BY display_order ASC, code ASC`,
        [tenantId, outletId],
      );
    });
    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      outletId: r.outlet_id,
      code: r.code,
      name: r.name,
      kitchenStationId: r.kitchen_station_id,
      displayOrder: r.display_order,
      isActive: r.is_active,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async createMenuCategory(tenantId: string, dto: CreateMenuCategoryDto): Promise<MenuCategoryDto> {
    const id = crypto.randomUUID();
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `INSERT INTO menu_categories (id, tenant_id, outlet_id, code, name, kitchen_station_id, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, tenantId, dto.outletId, dto.code.toUpperCase(), dto.name, dto.kitchenStationId || null, dto.displayOrder || 0],
      );
      return q.rows[0];
    });
    return {
      id: res.id,
      tenantId: res.tenant_id,
      outletId: res.outlet_id,
      code: rCode(res.code),
      name: res.name,
      kitchenStationId: res.kitchen_station_id,
      displayOrder: res.display_order,
      isActive: res.is_active,
      createdAt: new Date(res.created_at).toISOString(),
    };
    function rCode(c: string) { return c; }
  }

  async getMenuItems(tenantId: string, outletId: string, categoryId?: string, search?: string): Promise<MenuItemDto[]> {
    let sql = `
      SELECT mi.*, mc.name as category_name, ks.name as kitchen_station_name,
             (r.id IS NOT NULL) as has_recipe
      FROM menu_items mi
      JOIN menu_categories mc ON mc.id = mi.category_id
      LEFT JOIN kitchen_stations ks ON ks.id = mi.kitchen_station_id
      LEFT JOIN recipes r ON r.menu_item_id = mi.id
      WHERE mi.tenant_id = $1 AND mi.outlet_id = $2
    `;
    const params: any[] = [tenantId, outletId];
    if (categoryId) {
      params.push(categoryId);
      sql += ` AND mi.category_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (mi.name ILIKE $${params.length} OR mi.code ILIKE $${params.length})`;
    }
    sql += ` ORDER BY mc.display_order ASC, mi.code ASC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      outletId: r.outlet_id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      kitchenStationId: r.kitchen_station_id,
      kitchenStationName: r.kitchen_station_name,
      code: r.code,
      name: r.name,
      description: r.description,
      basePrice: Number(r.base_price),
      taxRate: Number(r.tax_rate),
      serviceChargeRate: Number(r.service_charge_rate),
      itemType: r.item_type,
      isAvailable: r.is_available,
      isActive: r.is_active,
      hasRecipe: r.has_recipe,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async getMenuItemById(tenantId: string, id: string): Promise<MenuItemDto> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT mi.*, mc.name as category_name, ks.name as kitchen_station_name,
                (r.id IS NOT NULL) as has_recipe
         FROM menu_items mi
         JOIN menu_categories mc ON mc.id = mi.category_id
         LEFT JOIN kitchen_stations ks ON ks.id = mi.kitchen_station_id
         LEFT JOIN recipes r ON r.menu_item_id = mi.id
         WHERE mi.id = $1 AND mi.tenant_id = $2`,
        [id, tenantId],
      );
    });
    if (res.rows.length === 0) throw new NotFoundException(`Menu item ${id} not found`);
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      outletId: r.outlet_id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      kitchenStationId: r.kitchen_station_id,
      kitchenStationName: r.kitchen_station_name,
      code: r.code,
      name: r.name,
      description: r.description,
      basePrice: Number(r.base_price),
      taxRate: Number(r.tax_rate),
      serviceChargeRate: Number(r.service_charge_rate),
      itemType: r.item_type,
      isAvailable: r.is_available,
      isActive: r.is_active,
      hasRecipe: r.has_recipe,
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async createMenuItem(tenantId: string, dto: CreateMenuItemDto): Promise<MenuItemDto> {
    const id = crypto.randomUUID();
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `INSERT INTO menu_items (
          id, tenant_id, outlet_id, category_id, kitchen_station_id,
          code, name, description, base_price, tax_rate, service_charge_rate, item_type, is_available
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          id,
          tenantId,
          dto.outletId,
          dto.categoryId,
          dto.kitchenStationId || null,
          dto.code.toUpperCase(),
          dto.name,
          dto.description || null,
          dto.basePrice,
          dto.taxRate !== undefined ? dto.taxRate : 0.12,
          dto.serviceChargeRate !== undefined ? dto.serviceChargeRate : 0.10,
          dto.itemType || 'food',
          dto.isAvailable !== false,
        ],
      );
      return q.rows[0];
    });
    return this.getMenuItemById(tenantId, res.id);
  }

  async toggleMenuItemAvailability(tenantId: string, id: string, isAvailable: boolean): Promise<MenuItemDto> {
    await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      await client.query(
        `UPDATE menu_items SET is_available = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
        [isAvailable, id, tenantId],
      );
    });
    return this.getMenuItemById(tenantId, id);
  }

  async getRecipe(tenantId: string, menuItemId: string): Promise<RecipeDto | null> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `SELECT r.*, mi.name as menu_item_name
         FROM recipes r
         JOIN menu_items mi ON mi.id = r.menu_item_id
         WHERE r.menu_item_id = $1 AND r.tenant_id = $2`,
        [menuItemId, tenantId],
      );
      if (q.rows.length === 0) return null;
      const recipe = q.rows[0];

      const linesQ = await client.query(
        `SELECT rl.*, i.code as item_code, i.name as item_name, u.code as uom_code,
                sb.valuation_rate
         FROM recipe_lines rl
         JOIN items i ON i.id = rl.item_id
         JOIN uoms u ON u.id = i.base_uom_id
         LEFT JOIN (
           SELECT item_id, AVG(valuation_rate) as valuation_rate
           FROM stock_balances
           WHERE tenant_id = $1
           GROUP BY item_id
         ) sb ON sb.item_id = i.id
         WHERE rl.recipe_id = $2 AND rl.tenant_id = $1`,
        [tenantId, recipe.id],
      );

      let theoreticalCost = 0;
      const lines = linesQ.rows.map((l: any) => {
        const netQty = Number(l.qty);
        const yieldFactor = Number(l.yield_pct) / 100;
        const wasteFactor = 1 + Number(l.waste_pct) / 100;
        const grossQty = (netQty / yieldFactor) * wasteFactor;
        const unitValuation = Number(l.valuation_rate || 0);
        const lineCost = Math.round(grossQty * unitValuation * 10000) / 10000;
        theoreticalCost += lineCost;

        return {
          id: l.id,
          itemId: l.item_id,
          itemCode: l.item_code,
          itemName: l.item_name,
          uomCode: l.uom_code,
          qty: netQty,
          yieldPct: Number(l.yield_pct),
          wastePct: Number(l.waste_pct),
          grossQty: Math.round(grossQty * 10000) / 10000,
          unitCost: unitValuation,
          lineCost,
        };
      });

      return {
        id: recipe.id,
        tenantId: recipe.tenant_id,
        menuItemId: recipe.menu_item_id,
        menuItemName: recipe.menu_item_name,
        yieldServings: Number(recipe.yield_servings),
        notes: recipe.notes,
        theoreticalCost: Math.round(theoreticalCost * 100) / 100,
        lines,
        createdAt: new Date(recipe.created_at).toISOString(),
      };
    });
    return res;
  }

  async createOrUpdateRecipe(tenantId: string, dto: CreateRecipeDto): Promise<RecipeDto> {
    return this.db.transaction(tenantId, async (client) => {
      let recipeId = crypto.randomUUID();
      const existing = await client.query(
        `SELECT id FROM recipes WHERE menu_item_id = $1 AND tenant_id = $2`,
        [dto.menuItemId, tenantId],
      );
      if (existing.rows.length > 0) {
        recipeId = existing.rows[0].id;
        await client.query(
          `UPDATE recipes SET yield_servings = $1, notes = $2 WHERE id = $3`,
          [dto.yieldServings || 1, dto.notes || null, recipeId],
        );
        await client.query(`DELETE FROM recipe_lines WHERE recipe_id = $1`, [recipeId]);
      } else {
        await client.query(
          `INSERT INTO recipes (id, tenant_id, menu_item_id, yield_servings, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [recipeId, tenantId, dto.menuItemId, dto.yieldServings || 1, dto.notes || null],
        );
      }

      for (const line of dto.lines) {
        const lineId = crypto.randomUUID();
        await client.query(
          `INSERT INTO recipe_lines (id, tenant_id, recipe_id, item_id, qty, yield_pct, waste_pct)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [lineId, tenantId, recipeId, line.itemId, line.qty, line.yieldPct || 100, line.wastePct || 0],
        );
      }

      const res = await this.getRecipe(tenantId, dto.menuItemId);
      if (!res) throw new NotFoundException('Failed to retrieve created recipe');
      return res;
    });
  }

  // ==========================================================================
  // 3. POS SHIFTS & CASH MANAGEMENT
  // ==========================================================================

  async getShifts(tenantId: string, outletId?: string, status?: string): Promise<PosShiftDto[]> {
    let sql = `
      SELECT s.*, u.username as user_name
      FROM pos_shifts s
      JOIN users u ON u.id = s.user_id
      WHERE s.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (outletId) {
      params.push(outletId);
      sql += ` AND s.outlet_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND s.status = $${params.length}`;
    }
    sql += ` ORDER BY s.opened_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      outletId: r.outlet_id,
      userId: r.user_id,
      userName: r.user_name,
      shiftNo: r.shift_no,
      openedAt: new Date(r.opened_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      openingFloat: Number(r.opening_float),
      cashDrops: Number(r.cash_drops),
      cashPayments: Number(r.cash_payments),
      closingCash: r.closing_cash !== null ? Number(r.closing_cash) : null,
      expectedCash: r.expected_cash !== null ? Number(r.expected_cash) : null,
      variance: r.variance !== null ? Number(r.variance) : null,
      voucherId: r.voucher_id,
      status: r.status,
    }));
  }

  async getCurrentShift(tenantId: string, outletId: string, userId: string): Promise<PosShiftDto | null> {
    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(
        `SELECT s.*, u.username as user_name
         FROM pos_shifts s
         JOIN users u ON u.id = s.user_id
         WHERE s.tenant_id = $1 AND s.outlet_id = $2 AND s.user_id = $3 AND s.status = 'open'
         ORDER BY s.opened_at DESC LIMIT 1`,
        [tenantId, outletId, userId],
      );
    });
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      outletId: r.outlet_id,
      userId: r.user_id,
      userName: r.user_name,
      shiftNo: r.shift_no,
      openedAt: new Date(r.opened_at).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      openingFloat: Number(r.opening_float),
      cashDrops: Number(r.cash_drops),
      cashPayments: Number(r.cash_payments),
      closingCash: r.closing_cash !== null ? Number(r.closing_cash) : null,
      expectedCash: r.expected_cash !== null ? Number(r.expected_cash) : null,
      variance: r.variance !== null ? Number(r.variance) : null,
      voucherId: r.voucher_id,
      status: r.status,
    };
  }

  async openShift(tenantId: string, dto: OpenShiftDto, userId: string): Promise<PosShiftDto> {
    const id = crypto.randomUUID();
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const shiftNo = `SHF-${today}-${Math.floor(1000 + Math.random() * 9000)}`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      // Check if user already has open shift in this outlet
      const existing = await client.query(
        `SELECT id FROM pos_shifts WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND status = 'open'`,
        [tenantId, dto.outletId, userId],
      );
      if (existing.rows.length > 0) {
        throw new ConflictException('User already has an open shift for this outlet');
      }

      const q = await client.query(
        `INSERT INTO pos_shifts (
          id, tenant_id, branch_id, outlet_id, user_id, shift_no, opening_float, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
        RETURNING *`,
        [id, tenantId, dto.branchId, dto.outletId, userId, shiftNo, dto.openingFloat || 0],
      );
      return q.rows[0];
    });

    return {
      id: res.id,
      tenantId: res.tenant_id,
      branchId: res.branch_id,
      outletId: res.outlet_id,
      userId: res.user_id,
      shiftNo: res.shift_no,
      openedAt: new Date(res.opened_at).toISOString(),
      closedAt: null,
      openingFloat: Number(res.opening_float),
      cashDrops: 0,
      cashPayments: 0,
      closingCash: null,
      expectedCash: null,
      variance: null,
      status: 'open',
    };
  }

  async recordCashDrop(tenantId: string, shiftId: string, amount: number, reason?: string): Promise<PosShiftDto> {
    const row = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      const q = await client.query(
        `UPDATE pos_shifts
         SET cash_drops = cash_drops + $1
         WHERE id = $2 AND tenant_id = $3 AND status = 'open'
         RETURNING *`,
        [amount, shiftId, tenantId],
      );
      if (q.rows.length === 0) throw new NotFoundException(`Open shift ${shiftId} not found`);
      return q.rows[0];
    });

    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      outletId: row.outlet_id,
      userId: row.user_id,
      shiftNo: row.shift_no,
      openedAt: new Date(row.opened_at).toISOString(),
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      openingFloat: Number(row.opening_float),
      cashDrops: Number(row.cash_drops),
      cashPayments: Number(row.cash_payments),
      closingCash: row.closing_cash !== null ? Number(row.closing_cash) : null,
      expectedCash: row.expected_cash !== null ? Number(row.expected_cash) : null,
      variance: row.variance !== null ? Number(row.variance) : null,
      voucherId: row.voucher_id || null,
      status: row.status,
    };
  }

  async closeShift(tenantId: string, shiftId: string, dto: CloseShiftDto, userId: string): Promise<PosShiftDto> {
    return this.db.transaction(tenantId, async (client) => {
      const shiftRes = await client.query(
        `SELECT * FROM pos_shifts WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [shiftId, tenantId],
      );
      if (shiftRes.rows.length === 0) throw new NotFoundException(`Shift ${shiftId} not found`);
      const s = shiftRes.rows[0];
      if (s.status === 'closed') throw new BadRequestException(`Shift ${shiftId} is already closed`);

      const openingFloat = Number(s.opening_float);
      const cashDrops = Number(s.cash_drops);
      const cashPayments = Number(s.cash_payments);
      const expectedCash = Math.round((openingFloat + cashPayments - cashDrops) * 10000) / 10000;
      const closingCash = Number(dto.closingCash);
      const variance = Math.round((closingCash - expectedCash) * 10000) / 10000;

      let voucherId: string | null = null;
      if (variance !== 0) {
        try {
          let postDate = new Date().toISOString().split('T')[0];
          const periodCheck = await client.query(
            `SELECT id FROM fiscal_periods WHERE tenant_id = $1 AND start_date <= $2 AND end_date >= $2 AND status = 'open'`,
            [tenantId, postDate],
          );
          if (periodCheck.rows.length === 0) {
            const openPeriod = await client.query(
              `SELECT start_date FROM fiscal_periods WHERE tenant_id = $1 AND status = 'open' ORDER BY start_date DESC LIMIT 1`,
              [tenantId],
            );
            if (openPeriod.rows.length > 0) {
              postDate = new Date(openPeriod.rows[0].start_date).toISOString().split('T')[0];
            }
          }

          const voucher = await this.accountingService.postOperationalEvent(
            tenantId,
            s.branch_id,
            'pos.shift_variance',
            {
              date: postDate,
              description: `POS Shift ${s.shift_no} Discrepancy Reconciliation (${variance > 0 ? 'Over' : 'Short'})`,
              grossAmount: Math.abs(variance),
              sourceType: 'pos_shift',
              sourceId: s.id,
            },
            client,
          );
          if (voucher) voucherId = voucher.id;
        } catch (err: any) {
          console.warn(`[RestaurantService] Shift variance voucher posting skipped: ${err.message}`);
        }
      }

      await client.query(
        `UPDATE pos_shifts
         SET status = 'closed', closed_at = now(), closing_cash = $1, expected_cash = $2,
             variance = $3, voucher_id = $4
         WHERE id = $5`,
        [closingCash, expectedCash, variance, voucherId, shiftId],
      );

      return {
        id: s.id,
        tenantId: s.tenant_id,
        branchId: s.branch_id,
        outletId: s.outlet_id,
        userId: s.user_id,
        shiftNo: s.shift_no,
        openedAt: new Date(s.opened_at).toISOString(),
        closedAt: new Date().toISOString(),
        openingFloat,
        cashDrops,
        cashPayments,
        closingCash,
        expectedCash,
        variance,
        voucherId,
        status: 'closed',
      };
    });
  }

  // ==========================================================================
  // 4. IN-HOUSE GUEST LOOKUP (ROOM CHARGES)
  // ==========================================================================

  async lookupInHouseGuests(tenantId: string, branchId: string, search?: string): Promise<InHouseGuestLookupDto[]> {
    let sql = `
      SELECT s.id as stay_id, f.id as folio_id, g.id as guest_id,
             CONCAT(g.first_name, ' ', g.last_name) as guest_name,
             u.id as unit_id, u.number as unit_number
      FROM stays s
      JOIN units u ON u.id = s.unit_id
      JOIN guests g ON g.id = s.guest_id
      JOIN folios f ON f.stay_id = s.id AND f.status = 'open'
      WHERE s.tenant_id = $1 AND s.branch_id = $2 AND s.status = 'in_house'
    `;
    const params: any[] = [tenantId, branchId];
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (u.number ILIKE $${params.length} OR g.last_name ILIKE $${params.length} OR g.first_name ILIKE $${params.length})`;
    }
    sql += ` ORDER BY u.number ASC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      stayId: r.stay_id,
      folioId: r.folio_id,
      guestId: r.guest_id,
      guestName: r.guest_name,
      unitId: r.unit_id,
      unitNumber: r.unit_number,
    }));
  }

  // ==========================================================================
  // 5. POS ORDERS & KITCHEN ORDER TICKETS (KOT)
  // ==========================================================================

  async getOrders(tenantId: string, outletId: string, status?: string): Promise<PosOrderDto[]> {
    let sql = `
      SELECT o.*, t.table_number, ot.name as outlet_name
      FROM pos_orders o
      JOIN outlets ot ON ot.id = o.outlet_id
      LEFT JOIN dining_tables t ON t.id = o.table_id
      WHERE o.tenant_id = $1 AND o.outlet_id = $2
    `;
    const params: any[] = [tenantId, outletId];
    if (status) {
      params.push(status);
      sql += ` AND o.status = $${params.length}`;
    }
    sql += ` ORDER BY o.created_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      outletId: r.outlet_id,
      outletName: r.outlet_name,
      tableId: r.table_id,
      tableNumber: r.table_number,
      orderNo: r.order_no,
      covers: r.covers,
      status: r.status,
      subtotal: Number(r.subtotal),
      taxAmount: Number(r.tax_amount),
      serviceChargeAmount: Number(r.service_charge_amount),
      totalAmount: Number(r.total_amount),
      notes: r.notes,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  async getOrderById(tenantId: string, id: string, externalClient?: any): Promise<PosOrderDto> {
    const fetchWithClient = async (client: any) => {
      const q = await client.query(
        `SELECT o.*, t.table_number, ot.name as outlet_name
         FROM pos_orders o
         JOIN outlets ot ON ot.id = o.outlet_id
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.id = $1 AND o.tenant_id = $2`,
        [id, tenantId],
      );
      if (q.rows.length === 0) throw new NotFoundException(`Order ${id} not found`);

      const linesQ = await client.query(
        `SELECT pol.*, mi.code as menu_item_code, mi.name as menu_item_name,
                ks.code as station_code, ks.name as station_name
         FROM pos_order_lines pol
         JOIN menu_items mi ON mi.id = pol.menu_item_id
         LEFT JOIN kitchen_stations ks ON ks.id = mi.kitchen_station_id
         WHERE pol.order_id = $1 AND pol.tenant_id = $2
         ORDER BY pol.line_no ASC`,
        [id, tenantId],
      );

      return {
        order: q.rows[0],
        lines: linesQ.rows,
      };
    };

    const res = externalClient
      ? await fetchWithClient(externalClient)
      : await this.db.withTenantConnection(tenantId, undefined, fetchWithClient);

    const o = res.order;
    return {
      id: o.id,
      tenantId: o.tenant_id,
      branchId: o.branch_id,
      outletId: o.outlet_id,
      outletName: o.outlet_name,
      tableId: o.table_id,
      tableNumber: o.table_number,
      orderNo: o.order_no,
      covers: o.covers,
      status: o.status,
      subtotal: Number(o.subtotal),
      taxAmount: Number(o.tax_amount),
      serviceChargeAmount: Number(o.service_charge_amount),
      totalAmount: Number(o.total_amount),
      notes: o.notes,
      createdAt: new Date(o.created_at).toISOString(),
      lines: res.lines.map((l: any) => ({
        id: l.id,
        lineNo: l.line_no,
        menuItemId: l.menu_item_id,
        menuItemCode: l.menu_item_code,
        menuItemName: l.menu_item_name,
        stationCode: l.station_code,
        stationName: l.station_name,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        taxRate: Number(l.tax_rate),
        taxAmount: Number(l.tax_amount),
        lineTotal: Number(l.line_total),
        seatNo: l.seat_no,
        course: l.course,
        status: l.status,
        modifiers: l.modifiers,
        notes: l.notes,
        voidReason: l.void_reason,
      })),
    };
  }

  async createOrder(tenantId: string, dto: CreatePosOrderDto, userId: string): Promise<PosOrderDto> {
    return this.db.transaction(tenantId, async (client) => {
      const orderNo = await this.generateNextDocNo(client, tenantId, dto.branchId, 'pos_order', 'ORD');
      const orderId = crypto.randomUUID();

      await client.query(
        `INSERT INTO pos_orders (
          id, tenant_id, branch_id, outlet_id, table_id, shift_id, order_no, covers,
          server_user_id, status, subtotal, tax_amount, service_charge_amount, total_amount, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', 0, 0, 0, 0, $10)`,
        [
          orderId,
          tenantId,
          dto.branchId,
          dto.outletId,
          dto.tableId || null,
          dto.shiftId || null,
          orderNo,
          dto.covers || 1,
          userId || null,
          dto.notes || null,
        ],
      );

      if (dto.tableId) {
        await client.query(
          `UPDATE dining_tables SET status = 'ordered', current_order_id = $1, updated_at = now()
           WHERE id = $2 AND tenant_id = $3`,
          [orderId, dto.tableId, tenantId],
        );
      }

      // Add lines if provided
      if (dto.lines && dto.lines.length > 0) {
        let lineNo = 1;
        let subtotal = 0;
        let taxAmount = 0;
        let serviceChargeAmount = 0;

        for (const line of dto.lines) {
          const itemRes = await client.query(
            `SELECT * FROM menu_items WHERE id = $1 AND tenant_id = $2`,
            [line.menuItemId, tenantId],
          );
          if (itemRes.rows.length === 0) continue;
          const item = itemRes.rows[0];

          const qty = Number(line.quantity || 1);
          const price = Number(item.base_price);
          const lineSubtotal = Math.round(qty * price * 10000) / 10000;
          const lineTax = Math.round(lineSubtotal * Number(item.tax_rate) * 10000) / 10000;
          const lineServiceCharge = Math.round(lineSubtotal * Number(item.service_charge_rate) * 10000) / 10000;
          const lineTotal = Math.round((lineSubtotal + lineTax + lineServiceCharge) * 10000) / 10000;

          subtotal += lineSubtotal;
          taxAmount += lineTax;
          serviceChargeAmount += lineServiceCharge;

          await client.query(
            `INSERT INTO pos_order_lines (
              id, tenant_id, order_id, line_no, menu_item_id, quantity, unit_price,
              tax_rate, tax_amount, line_total, seat_no, course, status, modifiers, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, $14)`,
            [
              crypto.randomUUID(),
              tenantId,
              orderId,
              lineNo++,
              line.menuItemId,
              qty,
              price,
              item.tax_rate,
              lineTax,
              lineTotal,
              line.seatNo || 1,
              line.course || 'main',
              JSON.stringify(line.modifiers || []),
              line.notes || null,
            ],
          );
        }

        const totalAmount = Math.round((subtotal + taxAmount + serviceChargeAmount) * 10000) / 10000;
        await client.query(
          `UPDATE pos_orders
           SET subtotal = $1, tax_amount = $2, service_charge_amount = $3, total_amount = $4
           WHERE id = $5`,
          [subtotal, taxAmount, serviceChargeAmount, totalAmount, orderId],
        );
      }

      return this.getOrderById(tenantId, orderId, client);
    });
  }

  async addOrderLines(tenantId: string, orderId: string, dto: AddOrderLinesDto): Promise<PosOrderDto> {
    return this.db.transaction(tenantId, async (client) => {
      const orderRes = await client.query(
        `SELECT * FROM pos_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [orderId, tenantId],
      );
      if (orderRes.rows.length === 0) throw new NotFoundException(`Order ${orderId} not found`);
      const order = orderRes.rows[0];

      if (['settled', 'voided'].includes(order.status)) {
        throw new BadRequestException(`Cannot add lines to ${order.status} order`);
      }

      const countRes = await client.query(
        `SELECT COALESCE(MAX(line_no), 0) as max_line FROM pos_order_lines WHERE order_id = $1`,
        [orderId],
      );
      let lineNo = parseInt(countRes.rows[0]?.max_line || '0', 10) + 1;

      for (const line of dto.lines) {
        const itemRes = await client.query(
          `SELECT * FROM menu_items WHERE id = $1 AND tenant_id = $2`,
          [line.menuItemId, tenantId],
        );
        if (itemRes.rows.length === 0) continue;
        const item = itemRes.rows[0];

        const qty = Number(line.quantity || 1);
        const price = Number(item.base_price);
        const lineSubtotal = Math.round(qty * price * 10000) / 10000;
        const lineTax = Math.round(lineSubtotal * Number(item.tax_rate) * 10000) / 10000;
        const lineServiceCharge = Math.round(lineSubtotal * Number(item.service_charge_rate) * 10000) / 10000;
        const lineTotal = Math.round((lineSubtotal + lineTax + lineServiceCharge) * 10000) / 10000;

        await client.query(
          `INSERT INTO pos_order_lines (
            id, tenant_id, order_id, line_no, menu_item_id, quantity, unit_price,
            tax_rate, tax_amount, line_total, seat_no, course, status, modifiers, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, $14)`,
          [
            crypto.randomUUID(),
            tenantId,
            orderId,
            lineNo++,
            line.menuItemId,
            qty,
            price,
            item.tax_rate,
            lineTax,
            lineTotal,
            line.seatNo || 1,
            line.course || 'main',
            JSON.stringify(line.modifiers || []),
            line.notes || null,
          ],
        );
      }

      // Recalculate totals
      const totalsRes = await client.query(
        `SELECT
           SUM(quantity * unit_price) as subtotal,
           SUM(tax_amount) as tax_amount,
           SUM(quantity * unit_price * 0.10) as service_charge,
           SUM(line_total) as total_amount
         FROM pos_order_lines
         WHERE order_id = $1 AND status != 'voided'`,
        [orderId],
      );
      const subtotal = Number(totalsRes.rows[0]?.subtotal || 0);
      const taxAmount = Number(totalsRes.rows[0]?.tax_amount || 0);
      const serviceCharge = Number(totalsRes.rows[0]?.service_charge || 0);
      const totalAmount = Math.round((subtotal + taxAmount + serviceCharge) * 10000) / 10000;

      await client.query(
        `UPDATE pos_orders
         SET subtotal = $1, tax_amount = $2, service_charge_amount = $3, total_amount = $4, updated_at = now()
         WHERE id = $5`,
        [subtotal, taxAmount, serviceCharge, totalAmount, orderId],
      );

      return this.getOrderById(tenantId, orderId, client);
    });
  }

  async fireOrderLines(tenantId: string, orderId: string, dto: FireKotDto): Promise<KotDto[]> {
    return this.db.transaction(tenantId, async (client) => {
      const orderRes = await client.query(
        `SELECT o.*, t.table_number
         FROM pos_orders o
         LEFT JOIN dining_tables t ON t.id = o.table_id
         WHERE o.id = $1 AND o.tenant_id = $2 FOR UPDATE OF o`,
        [orderId, tenantId],
      );
      if (orderRes.rows.length === 0) throw new NotFoundException(`Order ${orderId} not found`);
      const order = orderRes.rows[0];

      let linesQuery = `
        SELECT pol.*, mi.kitchen_station_id, ks.code as station_code, ks.name as station_name
        FROM pos_order_lines pol
        JOIN menu_items mi ON mi.id = pol.menu_item_id
        LEFT JOIN kitchen_stations ks ON ks.id = mi.kitchen_station_id
        WHERE pol.order_id = $1 AND pol.tenant_id = $2 AND pol.status = 'pending'
      `;
      const queryParams: any[] = [orderId, tenantId];
      if (dto.orderLineIds && dto.orderLineIds.length > 0) {
        queryParams.push(dto.orderLineIds);
        linesQuery += ` AND pol.id = ANY($3)`;
      }

      const linesRes = await client.query(linesQuery, queryParams);
      if (linesRes.rows.length === 0) {
        throw new BadRequestException('No pending order lines to fire');
      }

      // Group by kitchen station
      const byStation: Record<string, any[]> = {};
      for (const line of linesRes.rows) {
        const staId = line.kitchen_station_id || 'unassigned';
        if (!byStation[staId]) byStation[staId] = [];
        byStation[staId].push(line);
      }

      const createdKots: KotDto[] = [];
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

      for (const [stationId, lines] of Object.entries(byStation)) {
        const kotId = crypto.randomUUID();
        const stationCode = lines[0]?.station_code || 'MAIN';
        const kotNo = `KOT-${stationCode}-${today}-${Math.floor(100 + Math.random() * 900)}`;

        await client.query(
          `INSERT INTO kots (id, tenant_id, outlet_id, station_id, order_id, table_id, kot_no, is_void, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'pending')`,
          [
            kotId,
            tenantId,
            order.outlet_id,
            stationId !== 'unassigned' ? stationId : null,
            orderId,
            order.table_id || null,
            kotNo,
          ],
        );

        for (const line of lines) {
          await client.query(
            `INSERT INTO kot_lines (id, tenant_id, kot_id, order_line_id, menu_item_id, quantity, modifiers, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              crypto.randomUUID(),
              tenantId,
              kotId,
              line.id,
              line.menu_item_id,
              line.quantity,
              line.modifiers,
              line.notes,
            ],
          );

          // Mark line as fired
          await client.query(
            `UPDATE pos_order_lines SET status = 'fired' WHERE id = $1`,
            [line.id],
          );
        }

        createdKots.push({
          id: kotId,
          tenantId,
          outletId: order.outlet_id,
          stationId: stationId !== 'unassigned' ? stationId : null,
          stationName: lines[0]?.station_name,
          orderId,
          tableNumber: order.table_number,
          kotNo,
          isVoid: false,
          status: 'pending',
          firedAt: new Date().toISOString(),
          lines: lines.map((l) => ({
            id: l.id,
            orderLineId: l.id,
            menuItemId: l.menu_item_id,
            quantity: Number(l.quantity),
            notes: l.notes,
          })),
        });
      }

      // Update order status to fired
      await client.query(
        `UPDATE pos_orders SET status = 'fired', updated_at = now() WHERE id = $1`,
        [orderId],
      );

      return createdKots;
    });
  }

  async voidOrderLine(
    tenantId: string,
    orderId: string,
    lineId: string,
    dto: VoidOrderLineDto,
    userId: string,
  ): Promise<PosOrderDto> {
    return this.db.transaction(tenantId, async (client) => {
      const lineRes = await client.query(
        `SELECT pol.*, mi.kitchen_station_id, ks.code as station_code, o.table_id
         FROM pos_order_lines pol
         JOIN pos_orders o ON o.id = pol.order_id
         JOIN menu_items mi ON mi.id = pol.menu_item_id
         LEFT JOIN kitchen_stations ks ON ks.id = mi.kitchen_station_id
         WHERE pol.id = $1 AND pol.order_id = $2 AND pol.tenant_id = $3
         FOR UPDATE OF pol`,
        [lineId, orderId, tenantId],
      );
      if (lineRes.rows.length === 0) throw new NotFoundException(`Order line ${lineId} not found`);
      const line = lineRes.rows[0];

      if (line.status === 'voided') {
        throw new BadRequestException('Line is already voided');
      }

      const wasFired = line.status === 'fired';

      // 1. Mark line voided
      await client.query(
        `UPDATE pos_order_lines
         SET status = 'voided', void_reason = $1
         WHERE id = $2`,
        [dto.reason, lineId],
      );

      // 2. If post-fire void, emit Void KOT to station (REQ-FNB-005)
      if (wasFired) {
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const voidKotNo = `VOID-${line.station_code || 'KDS'}-${today}-${Math.floor(100 + Math.random() * 900)}`;
        const voidKotId = crypto.randomUUID();

        await client.query(
          `INSERT INTO kots (id, tenant_id, outlet_id, station_id, order_id, table_id, kot_no, is_void, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'voided')`,
          [
            voidKotId,
            tenantId,
            line.outlet_id || (await client.query('SELECT outlet_id FROM pos_orders WHERE id = $1', [orderId])).rows[0]?.outlet_id,
            line.kitchen_station_id || null,
            orderId,
            line.table_id || null,
            voidKotNo,
          ],
        );

        await client.query(
          `INSERT INTO kot_lines (id, tenant_id, kot_id, order_line_id, menu_item_id, quantity, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            crypto.randomUUID(),
            tenantId,
            voidKotId,
            lineId,
            line.menu_item_id,
            line.quantity,
            `VOID REASON: ${dto.reason}`,
          ],
        );
      }

      // 3. Recalculate totals
      const totalsRes = await client.query(
        `SELECT
           COALESCE(SUM(quantity * unit_price), 0) as subtotal,
           COALESCE(SUM(tax_amount), 0) as tax_amount,
           COALESCE(SUM(quantity * unit_price * 0.10), 0) as service_charge
         FROM pos_order_lines
         WHERE order_id = $1 AND status != 'voided'`,
        [orderId],
      );
      const subtotal = Number(totalsRes.rows[0]?.subtotal || 0);
      const taxAmount = Number(totalsRes.rows[0]?.tax_amount || 0);
      const serviceCharge = Number(totalsRes.rows[0]?.service_charge || 0);
      const totalAmount = Math.round((subtotal + taxAmount + serviceCharge) * 10000) / 10000;

      await client.query(
        `UPDATE pos_orders
         SET subtotal = $1, tax_amount = $2, service_charge_amount = $3, total_amount = $4, updated_at = now()
         WHERE id = $5`,
        [subtotal, taxAmount, serviceCharge, totalAmount, orderId],
      );

      return this.getOrderById(tenantId, orderId, client);
    });
  }

  // ==========================================================================
  // 6. BILLING & ATOMIC SETTLEMENT (REQ-FNB-006, REQ-FNB-007, REQ-FNB-009)
  // ==========================================================================

  async getBills(tenantId: string, outletId: string, status?: string): Promise<PosBillDto[]> {
    let sql = `
      SELECT b.*, t.table_number
      FROM pos_bills b
      LEFT JOIN dining_tables t ON t.id = b.table_id
      WHERE b.tenant_id = $1 AND b.outlet_id = $2
    `;
    const params: any[] = [tenantId, outletId];
    if (status) {
      params.push(status);
      sql += ` AND b.status = $${params.length}`;
    }
    sql += ` ORDER BY b.created_at DESC`;

    const res = await this.db.withTenantConnection(tenantId, undefined, async (client) => {
      return client.query(sql, params);
    });

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      outletId: r.outlet_id,
      orderId: r.order_id,
      tableNumber: r.table_number,
      billNo: r.bill_no,
      subtotal: Number(r.subtotal),
      discountAmount: Number(r.discount_amount),
      serviceChargeAmount: Number(r.service_charge_amount),
      taxAmount: Number(r.tax_amount),
      tipAmount: Number(r.tip_amount),
      totalAmount: Number(r.total_amount),
      paidAmount: Number(r.paid_amount),
      status: r.status,
      revenueVoucherId: r.revenue_voucher_id,
      cogsVoucherId: r.cogs_voucher_id,
      createdAt: new Date(r.created_at).toISOString(),
      settledAt: r.settled_at ? new Date(r.settled_at).toISOString() : null,
    }));
  }

  async getBillById(tenantId: string, id: string, externalClient?: any): Promise<PosBillDto> {
    const fetchWithClient = async (client: any) => {
      const q = await client.query(
        `SELECT b.*, t.table_number
         FROM pos_bills b
         LEFT JOIN dining_tables t ON t.id = b.table_id
         WHERE b.id = $1 AND b.tenant_id = $2`,
        [id, tenantId],
      );
      if (q.rows.length === 0) throw new NotFoundException(`Bill ${id} not found`);

      const paymentsQ = await client.query(
        `SELECT * FROM pos_bill_payments WHERE bill_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );

      return {
        bill: q.rows[0],
        payments: paymentsQ.rows,
      };
    };

    const res = externalClient
      ? await fetchWithClient(externalClient)
      : await this.db.withTenantConnection(tenantId, undefined, fetchWithClient);

    const b = res.bill;
    return {
      id: b.id,
      tenantId: b.tenant_id,
      branchId: b.branch_id,
      outletId: b.outlet_id,
      orderId: b.order_id,
      tableNumber: b.table_number,
      billNo: b.bill_no,
      subtotal: Number(b.subtotal),
      discountAmount: Number(b.discount_amount),
      serviceChargeAmount: Number(b.service_charge_amount),
      taxAmount: Number(b.tax_amount),
      tipAmount: Number(b.tip_amount),
      totalAmount: Number(b.total_amount),
      paidAmount: Number(b.paid_amount),
      status: b.status,
      revenueVoucherId: b.revenue_voucher_id,
      cogsVoucherId: b.cogs_voucher_id,
      createdAt: new Date(b.created_at).toISOString(),
      settledAt: b.settled_at ? new Date(b.settled_at).toISOString() : null,
      payments: res.payments.map((p: any) => ({
        id: p.id,
        paymentMethod: p.payment_method,
        amount: Number(p.amount),
        tenderReference: p.tender_reference,
        stayId: p.stay_id,
        folioId: p.folio_id,
      })),
    };
  }

  async createBill(tenantId: string, dto: CreateBillDto, userId: string): Promise<PosBillDto> {
    return this.db.transaction(tenantId, async (client) => {
      const orderRes = await client.query(
        `SELECT * FROM pos_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [dto.orderId, tenantId],
      );
      if (orderRes.rows.length === 0) throw new NotFoundException(`Order ${dto.orderId} not found`);
      const order = orderRes.rows[0];

      if (['settled', 'voided'].includes(order.status)) {
        throw new BadRequestException(`Cannot create bill for ${order.status} order`);
      }

      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const billNo = `CHK-${today}-${Math.floor(1000 + Math.random() * 9000)}`;
      const billId = crypto.randomUUID();

      const subtotal = Number(order.subtotal);
      const discount = Number(dto.discountAmount || 0);
      const discountedSubtotal = Math.max(0, subtotal - discount);
      const serviceCharge = Math.round(discountedSubtotal * 0.10 * 10000) / 10000;
      const tax = Math.round(discountedSubtotal * 0.12 * 10000) / 10000;
      const tip = Number(dto.tipAmount || 0);
      const totalAmount = Math.round((discountedSubtotal + serviceCharge + tax + tip) * 10000) / 10000;

      await client.query(
        `INSERT INTO pos_bills (
          id, tenant_id, branch_id, outlet_id, order_id, table_id, bill_no,
          subtotal, discount_amount, discount_reason, service_charge_amount,
          tax_amount, tip_amount, total_amount, paid_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0, 'open')`,
        [
          billId,
          tenantId,
          order.branch_id,
          order.outlet_id,
          order.id,
          order.table_id || null,
          billNo,
          subtotal,
          discount,
          dto.discountReason || null,
          serviceCharge,
          tax,
          tip,
          totalAmount,
        ],
      );

      // Update order and table status to 'billed'
      await client.query(`UPDATE pos_orders SET status = 'billed' WHERE id = $1`, [order.id]);
      if (order.table_id) {
        await client.query(
          `UPDATE dining_tables SET status = 'billed' WHERE id = $1`,
          [order.table_id],
        );
      }

      return this.getBillById(tenantId, billId, client);
    });
  }

  /**
   * ATOMIC SETTLEMENT ENGINE (REQ-FNB-006, REQ-FNB-007, REQ-FNB-009)
   * Executes in a single database transaction:
   * 1. Validates and records payments (Cash, Card, QR, Room Charge).
   * 2. For Room Charge: Validates in-house guest status and writes line to guest folio.
   * 3. Explodes recipes for all sold items and depletes inventory warehouse at WAC.
   * 4. Posts double-entry Revenue Voucher and COGS Voucher via PostingService.
   * 5. Closes bill, order, and table atomically.
   */
  async settleBill(tenantId: string, billId: string, dto: SettleBillDto, userId: string): Promise<PosBillDto> {
    return this.db.transaction(tenantId, async (client) => {
      // 1. Lock Bill & Order
      const billRes = await client.query(
        `SELECT b.*, o.outlet_id, ot.warehouse_id, ot.branch_id, ot.name as outlet_name
         FROM pos_bills b
         JOIN pos_orders o ON o.id = b.order_id
         JOIN outlets ot ON ot.id = b.outlet_id
         WHERE b.id = $1 AND b.tenant_id = $2 FOR UPDATE OF b`,
        [billId, tenantId],
      );
      if (billRes.rows.length === 0) throw new NotFoundException(`Bill ${billId} not found`);
      const bill = billRes.rows[0];

      if (bill.status !== 'open') {
        throw new BadRequestException(`Bill ${bill.bill_no} is already settled or voided`);
      }

      const totalBillAmount = Number(bill.total_amount);
      const payments = dto.payments || [];
      const totalPaymentAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

      if (totalPaymentAmount < totalBillAmount - 0.0001) {
        throw new BadRequestException(
          `Insufficient payment amount: paid $${totalPaymentAmount.toFixed(2)}, bill requires $${totalBillAmount.toFixed(2)}`,
        );
      }

      // Fetch business date
      const branchRes = await client.query(
        `SELECT business_date FROM branches WHERE id = $1 AND tenant_id = $2`,
        [bill.branch_id, tenantId],
      );
      let businessDate = branchRes.rows[0]?.business_date;
      if (businessDate instanceof Date) {
        businessDate = businessDate.toISOString().split('T')[0];
      }
      if (!businessDate) {
        businessDate = new Date().toISOString().split('T')[0];
      }
      const periodCheck = await client.query(
        `SELECT id FROM fiscal_periods WHERE tenant_id = $1 AND start_date <= $2 AND end_date >= $2 AND status = 'open'`,
        [tenantId, businessDate],
      );
      if (periodCheck.rows.length === 0) {
        const openPeriod = await client.query(
          `SELECT start_date FROM fiscal_periods WHERE tenant_id = $1 AND status = 'open' ORDER BY start_date DESC LIMIT 1`,
          [tenantId],
        );
        if (openPeriod.rows.length > 0) {
          businessDate = new Date(openPeriod.rows[0].start_date).toISOString().split('T')[0];
        }
      }

      let isRoomCharge = false;
      let roomChargeAmount = 0;

      // 2. Process Each Tender Payment
      for (const p of payments) {
        const paymentId = crypto.randomUUID();
        let stayId: string | null = null;
        let folioId: string | null = null;
        let folioLineId: string | null = null;

        if (p.paymentMethod === 'room_charge') {
          isRoomCharge = true;
          roomChargeAmount += Number(p.amount);

          // In-House Guest Verification (REQ-FNB-007)
          let guestQuery = `
            SELECT s.id as stay_id, f.id as folio_id, g.last_name, g.first_name, u.number as unit_number
            FROM stays s
            JOIN units u ON u.id = s.unit_id
            JOIN guests g ON g.id = s.guest_id
            JOIN folios f ON f.stay_id = s.id AND f.status = 'open'
            WHERE s.tenant_id = $1 AND s.branch_id = $2 AND s.status = 'in_house'
          `;
          const queryParams: any[] = [tenantId, bill.branch_id];

          if (p.roomNumber) {
            queryParams.push(p.roomNumber.trim());
            guestQuery += ` AND (u.number = $${queryParams.length} OR u.name = $${queryParams.length})`;
          }

          const guestRes = await client.query(guestQuery, queryParams);
          if (guestRes.rows.length === 0) {
            throw new BadRequestException(
              `Room Charge rejected: No in-house guest found for Room ${p.roomNumber || 'Unknown'} with an open folio`,
            );
          }

          const match = guestRes.rows[0];
          stayId = match.stay_id;
          folioId = match.folio_id;

          // Atomic Folio Line Insertion via FoliosService (same client)
          const postedLine = await this.foliosService.postCharge(
            tenantId,
            folioId!,
            {
              windowNo: 1,
              lineType: 'charge',
              chargeType: 'fnb',
              description: `Restaurant ${bill.outlet_name} Bill ${bill.bill_no}`,
              qty: 1,
              unitAmount: Number(p.amount),
              taxAmount: 0,
            },
            userId,
            client,
          );
          folioLineId = postedLine.id;
        }

        await client.query(
          `INSERT INTO pos_bill_payments (
            id, tenant_id, bill_id, payment_method, amount, tender_reference, stay_id, folio_id, folio_line_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            paymentId,
            tenantId,
            billId,
            p.paymentMethod,
            p.amount,
            p.tenderReference || p.roomNumber || 'Direct Payment',
            stayId,
            folioId,
            folioLineId,
          ],
        );
      }

      // 3. Explode Recipes & Deplete Inventory at WAC (REQ-FNB-008, REQ-FNB-009)
      const orderLinesRes = await client.query(
        `SELECT pol.*, mi.code as item_code, mi.item_type
         FROM pos_order_lines pol
         JOIN menu_items mi ON mi.id = pol.menu_item_id
         WHERE pol.order_id = $1 AND pol.status != 'voided'`,
        [bill.order_id],
      );

      let totalFoodCost = 0;
      let totalBevCost = 0;

      if (bill.warehouse_id) {
        for (const line of orderLinesRes.rows) {
          const recipeRes = await client.query(
            `SELECT * FROM recipes WHERE menu_item_id = $1 AND tenant_id = $2`,
            [line.menu_item_id, tenantId],
          );
          if (recipeRes.rows.length === 0) continue;
          const recipe = recipeRes.rows[0];

          const recipeLinesRes = await client.query(
            `SELECT * FROM recipe_lines WHERE recipe_id = $1 AND tenant_id = $2`,
            [recipe.id, tenantId],
          );

          for (const rLine of recipeLinesRes.rows) {
            const soldQty = Number(line.quantity);
            const yieldPct = Number(rLine.yield_pct) / 100;
            const wastePct = 1 + Number(rLine.waste_pct) / 100;
            const grossRequiredQty = Math.round(((Number(rLine.qty) * soldQty) / yieldPct) * wastePct * 10000) / 10000;

            if (grossRequiredQty > 0) {
              const movement = await this.inventoryService.applyStockMovement(
                client,
                tenantId,
                bill.branch_id,
                {
                  warehouseId: bill.warehouse_id,
                  itemId: rLine.item_id,
                  postingDate: businessDate,
                  docType: 'fnb_pos',
                  docId: billId,
                  docNo: bill.bill_no,
                  qtyDelta: -grossRequiredQty,
                  unitCost: 0,
                },
              );

              const absCost = Math.abs(movement.valueDelta);
              if (line.item_type === 'beverage') {
                totalBevCost += absCost;
              } else {
                totalFoodCost += absCost;
              }
            }
          }
        }
      }

      totalFoodCost = Math.round(totalFoodCost * 10000) / 10000;
      totalBevCost = Math.round(totalBevCost * 10000) / 10000;
      const totalCogsCost = Math.round((totalFoodCost + totalBevCost) * 10000) / 10000;

      // 4. Automated Accounting Posting via PostingService
      let revenueVoucherId: string | null = null;
      let cogsVoucherId: string | null = null;

      // Compute Food Net vs Bev Net revenue breakdown
      let foodNet = 0;
      let bevNet = 0;
      for (const line of orderLinesRes.rows) {
        const lineVal = Number(line.quantity) * Number(line.unit_price);
        if (line.item_type === 'beverage') {
          bevNet += lineVal;
        } else {
          foodNet += lineVal;
        }
      }
      foodNet = Math.round(foodNet * 10000) / 10000;
      bevNet = Math.round(bevNet * 10000) / 10000;

      const eventType = isRoomCharge ? 'fnb.revenue_room_charge' : 'fnb.revenue';
      try {
        const revVoucher = await this.accountingService.postOperationalEvent(
          tenantId,
          bill.branch_id,
          eventType,
          {
            date: businessDate,
            description: `F&B Bill ${bill.bill_no} Revenue Recognition (${bill.outlet_name})`,
            grossAmount: totalBillAmount,
            netAmount: Math.max(0, totalBillAmount - Number(bill.tax_amount)),
            taxAmount: Number(bill.tax_amount),
            sourceType: 'pos_bill',
            sourceId: billId,
          },
          client,
        );
        if (revVoucher) revenueVoucherId = revVoucher.id;
      } catch (err: any) {
        console.warn(`[RestaurantService] F&B Revenue voucher posting skipped: ${err.message}`);
      }

      if (totalCogsCost > 0) {
        try {
          const cogsVoucher = await this.accountingService.postOperationalEvent(
            tenantId,
            bill.branch_id,
            'fnb.cogs',
            {
              date: businessDate,
              description: `F&B Bill ${bill.bill_no} Recipe COGS Depletion`,
              grossAmount: totalCogsCost,
              sourceType: 'pos_bill',
              sourceId: billId,
            },
            client,
          );
          if (cogsVoucher) cogsVoucherId = cogsVoucher.id;
        } catch (err: any) {
          console.warn(`[RestaurantService] F&B COGS voucher posting skipped: ${err.message}`);
        }
      }

      // 5. Update Bill, Order, and Table State
      await client.query(
        `UPDATE pos_bills
         SET status = 'paid', paid_amount = $1, settled_at = now(),
             revenue_voucher_id = $2, cogs_voucher_id = $3
         WHERE id = $4`,
        [totalPaymentAmount, revenueVoucherId, cogsVoucherId, billId],
      );

      await client.query(
        `UPDATE pos_orders SET status = 'settled', updated_at = now() WHERE id = $1`,
        [bill.order_id],
      );

      if (bill.table_id) {
        await client.query(
          `UPDATE dining_tables SET status = 'dirty', current_order_id = null, updated_at = now()
           WHERE id = $1`,
          [bill.table_id],
        );
      }

      // 6. Outbox Event
      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, $2, 'pos_bill', $3, 'fnb.bill_settled', $4, 'pending')`,
        [
          crypto.randomUUID(),
          tenantId,
          billId,
          JSON.stringify({
            billId,
            billNo: bill.bill_no,
            orderId: bill.order_id,
            totalAmount: totalBillAmount,
            settledAt: new Date().toISOString(),
          }),
        ],
      );

      return this.getBillById(tenantId, billId, client);
    });
  }
}
