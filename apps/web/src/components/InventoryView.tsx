import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

// Master data interfaces
interface Uom {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface ItemCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
  negativeStockPolicy: 'block' | 'warn' | 'allow';
  isActive: boolean;
}

interface Supplier {
  id: string;
  code: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  currency: string;
  paymentTermsDays: number;
}

interface Item {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  categoryId: string;
  categoryName?: string;
  baseUomId: string;
  baseUomCode?: string;
  purchaseUomId?: string | null;
  purchaseUomCode?: string;
  purchaseUomConversion: number;
  standardCost: number;
  reorderPoint: number;
  defaultWarehouseId?: string | null;
  defaultWarehouseName?: string;
  isActive: boolean;
}

interface StockBalanceItem {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  categoryName: string;
  warehouseId: string;
  warehouseName: string;
  balanceQty: number;
  baseUomCode: string;
  valuationRate: number;
  totalValuation: number;
  reorderPoint: number;
  stockStatus: 'ok' | 'low' | 'out';
  lastMovementAt: string | null;
}

interface GrnLineItem {
  id?: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  receivedQty: number;
  uomCode?: string;
  unitCost: number;
  totalCost: number;
}

interface GoodsReceiptNoteItem {
  id: string;
  grnNo: string;
  supplierId: string;
  supplierName?: string;
  warehouseId: string;
  warehouseName?: string;
  receivedDate: string;
  invoiceRef?: string | null;
  totalAmount: number;
  status: string;
  voucherId?: string | null;
  linesCount: number;
  lines?: GrnLineItem[];
}

interface StockIssueLineItem {
  itemId: string;
  itemCode?: string;
  itemName?: string;
  qty: number;
  unitCost: number;
  totalCost: number;
}

interface StockIssueItem {
  id: string;
  issueNo: string;
  warehouseId: string;
  warehouseName?: string;
  department: string;
  issueDate: string;
  purpose?: string | null;
  totalAmount: number;
  voucherId?: string | null;
  linesCount: number;
  lines?: StockIssueLineItem[];
}

interface StockTransferItem {
  id: string;
  transferNo: string;
  sourceWarehouseId: string;
  sourceWarehouseName?: string;
  targetWarehouseId: string;
  targetWarehouseName?: string;
  transferDate: string;
  notes?: string | null;
  totalAmount: number;
  linesCount: number;
}

interface StockCountLineItem {
  itemId: string;
  itemCode?: string;
  itemName?: string;
  uomCode?: string;
  snapshotQty: number;
  countedQty: number | null;
  varianceQty: number | null;
  unitCost: number;
  varianceCost: number | null;
  notes?: string | null;
}

interface StockCountItem {
  id: string;
  countNo: string;
  warehouseId: string;
  warehouseName?: string;
  countDate: string;
  status: 'draft' | 'in_progress' | 'completed';
  isBlind: boolean;
  notes?: string | null;
  totalVarianceCost: number;
  lines?: StockCountLineItem[];
}

interface InventoryValuationReport {
  branchId: string;
  asOfDate: string;
  totalPhysicalValuation: number;
  glInventoryControlBalance: number;
  variance: number;
  isReconciled: boolean;
  items: Array<{
    itemId: string;
    itemCode: string;
    itemName: string;
    categoryName: string;
    warehouseName: string;
    balanceQty: number;
    baseUomCode: string;
    valuationRate: number;
    totalValuation: number;
  }>;
}

interface StockLedgerEntryItem {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  docType: string;
  docId: string;
  qtyDelta: number;
  unitCost: number;
  balanceQty: number;
  balanceValue: number;
  valuationRate: number;
  createdAt: string;
}

export const InventoryView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, activeBranchName } = useAppStore();

  const [activeTab, setActiveTab] = useState<'stock' | 'catalog' | 'grn' | 'movements' | 'audit' | 'valuation'>('stock');
  const [movementSubTab, setMovementSubTab] = useState<'issues' | 'transfers'>('issues');

  // Filter state
  const [warehouseFilter, setWarehouseFilter] = useState<string>('');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Modals state
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showAddGrnModal, setShowAddGrnModal] = useState(false);
  const [showAddIssueModal, setShowAddIssueModal] = useState(false);
  const [showAddTransferModal, setShowAddTransferModal] = useState(false);
  const [showAddCountModal, setShowAddCountModal] = useState(false);
  const [selectedCountForEntry, setSelectedCountForEntry] = useState<StockCountItem | null>(null);
  const [selectedItemForLedger, setSelectedItemForLedger] = useState<{ id: string; name: string; code: string } | null>(null);

  // Form states
  // 1. Add Item Form
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemBaseUom, setNewItemBaseUom] = useState('');
  const [newItemStandardCost, setNewItemStandardCost] = useState('10.00');
  const [newItemReorderPoint, setNewItemReorderPoint] = useState('5.00');
  const [newItemWarehouse, setNewItemWarehouse] = useState('');

  // 2. Add GRN Form
  const [grnSupplierId, setGrnSupplierId] = useState('');
  const [grnWarehouseId, setGrnWarehouseId] = useState('');
  const [grnInvoiceRef, setGrnInvoiceRef] = useState('');
  const [grnLines, setGrnLines] = useState<Array<{ itemId: string; qty: number; unitCost: number }>>([
    { itemId: '', qty: 10, unitCost: 15.0 },
  ]);

  // 3. Add Issue Form
  const [issueWarehouseId, setIssueWarehouseId] = useState('');
  const [issueDepartment, setIssueDepartment] = useState('Kitchen');
  const [issuePurpose, setIssuePurpose] = useState('');
  const [issueLines, setIssueLines] = useState<Array<{ itemId: string; qty: number }>>([
    { itemId: '', qty: 1 },
  ]);

  // 4. Add Transfer Form
  const [transferSourceWarehouseId, setTransferSourceWarehouseId] = useState('');
  const [transferTargetWarehouseId, setTransferTargetWarehouseId] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferLines, setTransferLines] = useState<Array<{ itemId: string; qty: number }>>([
    { itemId: '', qty: 1 },
  ]);

  // 5. Add Count Sheet Form
  const [countWarehouseId, setCountWarehouseId] = useState('');
  const [countIsBlind, setCountIsBlind] = useState(false);
  const [countNotes, setCountNotes] = useState('');

  // 6. Count entry lines state (itemId -> countedQty)
  const [countInputs, setCountInputs] = useState<Record<string, number>>({});

  // -------------------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------------------

  // 1. Warehouses
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['inventory-warehouses', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/inventory/warehouses?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load warehouses');
      return res.json();
    },
  });

  // 2. Categories
  const { data: categories = [] } = useQuery<ItemCategory[]>({
    queryKey: ['inventory-categories', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/inventory/categories', {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load categories');
      return res.json();
    },
  });

  // 3. UoMs
  const { data: uoms = [] } = useQuery<Uom[]>({
    queryKey: ['inventory-uoms', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/inventory/uoms', {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load UoMs');
      return res.json();
    },
  });

  // 4. Suppliers
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['inventory-suppliers', activeTenantId],
    queryFn: async () => {
      const res = await fetch('/api/v1/inventory/suppliers', {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load suppliers');
      return res.json();
    },
  });

  // 5. Items catalog
  const { data: items = [], isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ['inventory-items', activeTenantId, categoryFilter, catalogSearch],
    queryFn: async () => {
      let url = '/api/v1/inventory/items?';
      if (categoryFilter) url += `&categoryId=${categoryFilter}`;
      if (catalogSearch) url += `&search=${encodeURIComponent(catalogSearch)}`;
      const res = await fetch(url, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load items');
      return res.json();
    },
  });

  // 6. Stock on Hand
  const { data: stockOnHand = [], isLoading: stockLoading } = useQuery<StockBalanceItem[]>({
    queryKey: ['inventory-stock-on-hand', activeTenantId, activeBranchId, warehouseFilter],
    queryFn: async () => {
      let url = `/api/v1/inventory/stock-on-hand?branchId=${activeBranchId}`;
      if (warehouseFilter) url += `&warehouseId=${warehouseFilter}`;
      const res = await fetch(url, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load stock on hand');
      return res.json();
    },
  });

  // 7. Goods Receipts
  const { data: grns = [], isLoading: grnsLoading } = useQuery<GoodsReceiptNoteItem[]>({
    queryKey: ['inventory-grns', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/inventory/grns?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load GRNs');
      return res.json();
    },
  });

  // 8. Stock Issues
  const { data: issues = [], isLoading: issuesLoading } = useQuery<StockIssueItem[]>({
    queryKey: ['inventory-issues', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/inventory/issues?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load stock issues');
      return res.json();
    },
  });

  // 9. Stock Transfers
  const { data: transfers = [], isLoading: transfersLoading } = useQuery<StockTransferItem[]>({
    queryKey: ['inventory-transfers', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/inventory/transfers?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load stock transfers');
      return res.json();
    },
  });

  // 10. Stock Counts
  const { data: stockCounts = [], isLoading: countsLoading } = useQuery<StockCountItem[]>({
    queryKey: ['inventory-counts', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/inventory/counts?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load stock counts');
      return res.json();
    },
  });

  // 11. Valuation Report
  const { data: valuationReport, isLoading: valuationLoading } = useQuery<InventoryValuationReport>({
    queryKey: ['inventory-valuation', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/inventory/valuation-report?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load valuation report');
      return res.json();
    },
  });

  // 12. Stock Ledger (for audit stream or item drill-down)
  const { data: ledgerEntries = [], isLoading: ledgerLoading } = useQuery<StockLedgerEntryItem[]>({
    queryKey: ['inventory-ledger', activeTenantId, activeBranchId, selectedItemForLedger?.id],
    queryFn: async () => {
      let url = `/api/v1/inventory/ledger?branchId=${activeBranchId}`;
      if (selectedItemForLedger?.id) url += `&itemId=${selectedItemForLedger.id}`;
      const res = await fetch(url, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load ledger');
      return res.json();
    },
  });

  // Set default form dropdowns when lists load
  React.useEffect(() => {
    if (categories.length > 0 && !newItemCategory) setNewItemCategory(categories[0].id);
    if (uoms.length > 0 && !newItemBaseUom) setNewItemBaseUom(uoms[0].id);
    if (warehouses.length > 0) {
      if (!newItemWarehouse) setNewItemWarehouse(warehouses[0].id);
      if (!grnWarehouseId) setGrnWarehouseId(warehouses[0].id);
      if (!issueWarehouseId) setIssueWarehouseId(warehouses[0].id);
      if (!transferSourceWarehouseId) setTransferSourceWarehouseId(warehouses[0].id);
      if (warehouses.length > 1 && !transferTargetWarehouseId) {
        setTransferTargetWarehouseId(warehouses[1].id);
      }
      if (!countWarehouseId) setCountWarehouseId(warehouses[0].id);
    }
    if (suppliers.length > 0 && !grnSupplierId) setGrnSupplierId(suppliers[0].id);
    if (items.length > 0) {
      if (grnLines[0] && !grnLines[0].itemId) {
        setGrnLines([{ itemId: items[0].id, qty: 10, unitCost: Number(items[0].standardCost) || 15.0 }]);
      }
      if (issueLines[0] && !issueLines[0].itemId) {
        setIssueLines([{ itemId: items[0].id, qty: 1 }]);
      }
      if (transferLines[0] && !transferLines[0].itemId) {
        setTransferLines([{ itemId: items[0].id, qty: 1 }]);
      }
    }
  }, [categories, uoms, warehouses, suppliers, items]);

  // -------------------------------------------------------------------------
  // MUTATIONS
  // -------------------------------------------------------------------------

  // 1. Create Master Item
  const createItemMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/inventory/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          code: newItemCode.trim(),
          name: newItemName.trim(),
          categoryId: newItemCategory,
          baseUomId: newItemBaseUom,
          standardCost: parseFloat(newItemStandardCost) || 0,
          reorderPoint: parseFloat(newItemReorderPoint) || 0,
          defaultWarehouseId: newItemWarehouse || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create item');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-on-hand'] });
      setShowAddItemModal(false);
      setNewItemCode('');
      setNewItemName('');
    },
  });

  // 2. Create GRN
  const createGrnMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/inventory/grns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          supplierId: grnSupplierId,
          warehouseId: grnWarehouseId,
          receivedDate: new Date().toISOString().split('T')[0],
          invoiceRef: grnInvoiceRef.trim() || undefined,
          lines: grnLines
            .filter((l) => l.itemId && l.qty > 0)
            .map((l) => ({
              itemId: l.itemId,
              receivedQty: l.qty,
              unitCost: l.unitCost,
            })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to record GRN');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-grns'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-on-hand'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-ledger'] });
      setShowAddGrnModal(false);
      setGrnInvoiceRef('');
    },
  });

  // 3. Create Stock Issue
  const createIssueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/inventory/issues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          warehouseId: issueWarehouseId,
          department: issueDepartment,
          issueDate: new Date().toISOString().split('T')[0],
          purpose: issuePurpose.trim() || undefined,
          lines: issueLines
            .filter((l) => l.itemId && l.qty > 0)
            .map((l) => ({
              itemId: l.itemId,
              qty: l.qty,
            })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to issue material');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-issues'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-on-hand'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-ledger'] });
      setShowAddIssueModal(false);
      setIssuePurpose('');
    },
  });

  // 4. Create Inter-Warehouse Transfer
  const createTransferMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/inventory/transfers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          sourceWarehouseId: transferSourceWarehouseId,
          targetWarehouseId: transferTargetWarehouseId,
          transferDate: new Date().toISOString().split('T')[0],
          notes: transferNotes.trim() || undefined,
          lines: transferLines
            .filter((l) => l.itemId && l.qty > 0)
            .map((l) => ({
              itemId: l.itemId,
              qty: l.qty,
            })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create transfer');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-on-hand'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-ledger'] });
      setShowAddTransferModal(false);
      setTransferNotes('');
    },
  });

  // 5. Create Count Sheet
  const createCountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/inventory/counts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          warehouseId: countWarehouseId,
          countDate: new Date().toISOString().split('T')[0],
          isBlind: countIsBlind,
          notes: countNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create count sheet');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      setShowAddCountModal(false);
      setCountNotes('');
    },
  });

  // 6. Submit Count Entry Lines
  const submitCountLinesMutation = useMutation({
    mutationFn: async (countId: string) => {
      const lines = Object.entries(countInputs).map(([itemId, countedQty]) => ({
        itemId,
        countedQty,
      }));
      const res = await fetch(`/api/v1/inventory/counts/${countId}/lines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to submit count lines');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      setSelectedCountForEntry(null);
      setCountInputs({});
    },
  });

  // 7. Reconcile Count
  const reconcileCountMutation = useMutation({
    mutationFn: async (countId: string) => {
      const res = await fetch(`/api/v1/inventory/counts/${countId}/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to reconcile count');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-on-hand'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-ledger'] });
      setSelectedCountForEntry(null);
    },
  });

  // KPI Calculations
  const totalValuation = stockOnHand.reduce((sum, item) => sum + Number(item.totalValuation || 0), 0);
  const totalUnits = stockOnHand.reduce((sum, item) => sum + Number(item.balanceQty || 0), 0);
  const lowStockCount = stockOnHand.filter((i) => i.stockStatus === 'low' || i.stockStatus === 'out').length;

  return (
    <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-4">
      {/* Top Banner Card */}
      <div className="bg-white p-4 rounded-4 shadow-sm border d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
            style={{ width: '48px', height: '48px' }}
          >
            <i className="bi bi-boxes fs-4" />
          </div>
          <div>
            <h4 className="fw-bold mb-0 text-dark">Inventory & Purchasing</h4>
            <div className="text-muted small">
              Perpetual Stock Ledger · Weighted Average Cost (WAC) · Automated GL Integration ({activeBranchName})
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm d-flex align-items-center gap-2 px-3 fw-semibold"
            onClick={() => setShowAddItemModal(true)}
          >
            <i className="bi bi-plus-circle" />
            <span>New Master Item</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm d-flex align-items-center gap-2 px-3 fw-semibold shadow-sm"
            onClick={() => setShowAddGrnModal(true)}
          >
            <i className="bi bi-truck" />
            <span>Receive Goods (GRN)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="row g-3">
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100 p-3 bg-white">
            <div className="text-muted small fw-semibold text-uppercase">Total Stock Valuation</div>
            <div className="fs-3 fw-bold text-dark tabular-nums mt-1">
              ${totalValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-muted small mt-1 d-flex align-items-center gap-1">
              <i className="bi bi-calculator text-primary" />
              <span>Real-time WAC valuation</span>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100 p-3 bg-white">
            <div className="text-muted small fw-semibold text-uppercase">On-Hand Stock Units</div>
            <div className="fs-3 fw-bold text-primary tabular-nums mt-1">
              {totalUnits.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </div>
            <div className="text-muted small mt-1 d-flex align-items-center gap-1">
              <i className="bi bi-archive text-success" />
              <span>Across {warehouses.length} storage warehouses</span>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100 p-3 bg-white">
            <div className="text-muted small fw-semibold text-uppercase">Reorder & Low Stock Alerts</div>
            <div className={`fs-3 fw-bold tabular-nums mt-1 ${lowStockCount > 0 ? 'text-warning' : 'text-success'}`}>
              {lowStockCount}
            </div>
            <div className="text-muted small mt-1 d-flex align-items-center gap-1">
              <i className={`bi ${lowStockCount > 0 ? 'bi-exclamation-triangle-fill text-warning' : 'bi-check-circle-fill text-success'}`} />
              <span>{lowStockCount > 0 ? 'Replenishment needed' : 'All stock levels optimal'}</span>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card shadow-sm border-0 h-100 p-3 bg-white">
            <div className="text-muted small fw-semibold text-uppercase">GL Inventory Control Sync</div>
            <div className="fs-3 fw-bold tabular-nums mt-1">
              {valuationReport?.isReconciled ? (
                <span className="text-success fs-4 d-flex align-items-center gap-1">
                  <i className="bi bi-shield-check" /> Balanced
                </span>
              ) : (
                <span className="text-danger fs-4 d-flex align-items-center gap-1">
                  <i className="bi bi-exclamation-octagon" /> Diff: ${Math.abs(valuationReport?.variance || 0).toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-muted small mt-1 d-flex align-items-center gap-1">
              <i className="bi bi-journal-check text-info" />
              <span>GL 1210 / 1220 control sync</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar */}
      <div className="bg-white rounded-3 shadow-sm border p-2">
        <ul className="nav nav-pills gap-1">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'stock' ? 'active shadow-sm' : 'text-secondary'}`}
              onClick={() => setActiveTab('stock')}
            >
              <i className="bi bi-archive-fill" />
              <span>Stock on Hand</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'catalog' ? 'active shadow-sm' : 'text-secondary'}`}
              onClick={() => setActiveTab('catalog')}
            >
              <i className="bi bi-tags-fill" />
              <span>Item Catalog</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'grn' ? 'active shadow-sm' : 'text-secondary'}`}
              onClick={() => setActiveTab('grn')}
            >
              <i className="bi bi-truck-flatbed" />
              <span>Goods Receipts (GRN)</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'movements' ? 'active shadow-sm' : 'text-secondary'}`}
              onClick={() => setActiveTab('movements')}
            >
              <i className="bi bi-arrow-left-right" />
              <span>Issues & Transfers</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'audit' ? 'active shadow-sm' : 'text-secondary'}`}
              onClick={() => setActiveTab('audit')}
            >
              <i className="bi bi-clipboard2-check-fill" />
              <span>Stock Counts & Audits</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-3 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'valuation' ? 'active shadow-sm' : 'text-secondary'}`}
              onClick={() => setActiveTab('valuation')}
            >
              <i className="bi bi-graph-up-arrow" />
              <span>Valuation & GL Reconciliation</span>
            </button>
          </li>
        </ul>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* SUB-TAB 1: STOCK ON HAND */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'stock' && (
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-archive text-primary fs-5" />
              <span className="fw-bold text-dark">Live Warehouse Stock Balances</span>
              <span className="badge bg-light text-dark border ms-2">{stockOnHand.length} SKUs</span>
            </div>

            <div className="d-flex align-items-center gap-2">
              <select
                className="form-select form-select-sm"
                style={{ width: '220px' }}
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small text-muted ps-3">Item Code</th>
                  <th className="small text-muted">Item Name</th>
                  <th className="small text-muted">Category</th>
                  <th className="small text-muted">Warehouse</th>
                  <th className="small text-muted text-end">On Hand Qty</th>
                  <th className="small text-muted text-center">UoM</th>
                  <th className="small text-muted text-end">WAC Unit Cost</th>
                  <th className="small text-muted text-end">Total Valuation</th>
                  <th className="small text-muted text-center">Status</th>
                  <th className="small text-muted text-center pe-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stockLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-4 text-muted small">
                      Loading real-time stock balances...
                    </td>
                  </tr>
                ) : stockOnHand.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-4 text-muted small">
                      No stock records found for the selected warehouse filter.
                    </td>
                  </tr>
                ) : (
                  stockOnHand.map((item) => (
                    <tr key={`${item.warehouseId}-${item.itemId}`}>
                      <td className="ps-3 font-monospace small fw-semibold text-primary">{item.itemCode}</td>
                      <td className="fw-semibold text-dark small">{item.itemName}</td>
                      <td>
                        <span className="badge bg-light text-secondary border small">{item.categoryName}</span>
                      </td>
                      <td className="small text-muted">{item.warehouseName}</td>
                      <td className="text-end fw-bold tabular-nums small text-dark">
                        {Number(item.balanceQty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-center small text-muted font-monospace">{item.baseUomCode}</td>
                      <td className="text-end tabular-nums small text-muted">
                        ${Number(item.valuationRate).toFixed(2)}
                      </td>
                      <td className="text-end tabular-nums small fw-bold text-dark">
                        ${Number(item.totalValuation).toFixed(2)}
                      </td>
                      <td className="text-center">
                        {item.stockStatus === 'out' ? (
                          <span className="badge bg-danger-subtle text-danger border border-danger-subtle small">
                            Out of Stock
                          </span>
                        ) : item.stockStatus === 'low' ? (
                          <span className="badge bg-warning-subtle text-warning border border-warning-subtle small">
                            Low Stock (&lt;{item.reorderPoint})
                          </span>
                        ) : (
                          <span className="badge bg-success-subtle text-success border border-success-subtle small">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="text-center pe-3">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm py-0 px-2"
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => {
                            setSelectedItemForLedger({ id: item.itemId, name: item.itemName, code: item.itemCode });
                            setActiveTab('valuation');
                          }}
                        >
                          <i className="bi bi-clock-history me-1" />
                          Ledger
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUB-TAB 2: ITEM CATALOG & MASTER DATA */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'catalog' && (
        <div className="d-flex flex-column gap-3">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-tags text-primary fs-5" />
                <span className="fw-bold text-dark">Master Item Catalog</span>
                <span className="badge bg-light text-dark border ms-2">{items.length} Registered Items</span>
              </div>

              <div className="d-flex align-items-center gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search code or name..."
                  style={{ width: '220px' }}
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
                <select
                  className="form-select form-select-sm"
                  style={{ width: '180px' }}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary btn-sm fw-semibold d-flex align-items-center gap-1"
                  onClick={() => setShowAddItemModal(true)}
                >
                  <i className="bi bi-plus-lg" />
                  <span>Add Item</span>
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small text-muted ps-3">SKU / Code</th>
                    <th className="small text-muted">Item Name</th>
                    <th className="small text-muted">Category</th>
                    <th className="small text-muted text-center">Base UoM</th>
                    <th className="small text-muted text-end">Standard Cost</th>
                    <th className="small text-muted text-end">Reorder Point</th>
                    <th className="small text-muted">Default Warehouse</th>
                    <th className="small text-muted text-center pe-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-4 text-muted small">
                        Loading master item catalog...
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-4 text-muted small">
                        No items match the current search filters.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr key={item.id}>
                        <td className="ps-3 font-monospace small fw-bold text-primary">{item.code}</td>
                        <td className="fw-semibold text-dark small">{item.name}</td>
                        <td>
                          <span className="badge bg-light text-dark border small">{item.categoryName}</span>
                        </td>
                        <td className="text-center small text-muted font-monospace">{item.baseUomCode}</td>
                        <td className="text-end tabular-nums small text-dark">${Number(item.standardCost).toFixed(2)}</td>
                        <td className="text-end tabular-nums small text-muted">{Number(item.reorderPoint).toFixed(1)}</td>
                        <td className="small text-muted">{item.defaultWarehouseName || '—'}</td>
                        <td className="text-center pe-3">
                          <span className="badge bg-success-subtle text-success border border-success-subtle small">
                            Active
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Master Categories & UoMs Card */}
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <div className="card shadow-sm border-0 p-3 bg-white">
                <h6 className="fw-bold text-dark d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-folder2 text-primary" />
                  Item Categories ({categories.length})
                </h6>
                <div className="d-flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <span key={c.id} className="badge bg-light text-dark border p-2">
                      <span className="fw-bold">{c.code}</span> — {c.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="col-12 col-md-6">
              <div className="card shadow-sm border-0 p-3 bg-white">
                <h6 className="fw-bold text-dark d-flex align-items-center gap-2 mb-2">
                  <i className="bi bi-rulers text-info" />
                  Units of Measure ({uoms.length})
                </h6>
                <div className="d-flex flex-wrap gap-2">
                  {uoms.map((u) => (
                    <span key={u.id} className="badge bg-light text-secondary border p-2">
                      <span className="fw-bold text-dark">{u.code}</span> ({u.name} · {u.category})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUB-TAB 3: GOODS RECEIPTS (GRN) */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'grn' && (
        <div className="card shadow-sm border-0">
          <div className="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-truck text-primary fs-5" />
              <span className="fw-bold text-dark">Goods Receipt Notes (GRN)</span>
              <span className="badge bg-light text-dark border ms-2">{grns.length} Received Receipts</span>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm fw-semibold d-flex align-items-center gap-1 shadow-sm"
              onClick={() => setShowAddGrnModal(true)}
            >
              <i className="bi bi-plus-lg" />
              <span>Receive Shipment (GRN)</span>
            </button>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small text-muted ps-3">GRN Number</th>
                  <th className="small text-muted">Supplier</th>
                  <th className="small text-muted">Destination Warehouse</th>
                  <th className="small text-muted">Receipt Date</th>
                  <th className="small text-muted">Invoice Ref</th>
                  <th className="small text-muted text-end">Total Amount</th>
                  <th className="small text-muted text-center">Status</th>
                  <th className="small text-muted text-center pe-3">Accounting Voucher</th>
                </tr>
              </thead>
              <tbody>
                {grnsLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-4 text-muted small">
                      Loading goods receipts...
                    </td>
                  </tr>
                ) : grns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-4 text-muted small">
                      No Goods Receipt Notes recorded yet. Click &quot;Receive Shipment&quot; to accept inventory.
                    </td>
                  </tr>
                ) : (
                  grns.map((grn) => (
                    <tr key={grn.id}>
                      <td className="ps-3 font-monospace small fw-bold text-primary">{grn.grnNo}</td>
                      <td className="fw-semibold text-dark small">{grn.supplierName || 'Supplier'}</td>
                      <td className="small text-muted">{grn.warehouseName}</td>
                      <td className="small text-muted">{grn.receivedDate}</td>
                      <td className="small text-muted">{grn.invoiceRef || '—'}</td>
                      <td className="text-end tabular-nums small fw-bold text-dark">
                        ${Number(grn.totalAmount).toFixed(2)}
                      </td>
                      <td className="text-center">
                        <span className="badge bg-success-subtle text-success border border-success-subtle small">
                          Completed
                        </span>
                      </td>
                      <td className="text-center pe-3">
                        {grn.voucherId ? (
                          <span className="badge bg-primary-subtle text-primary border border-primary-subtle small d-inline-flex align-items-center gap-1">
                            <i className="bi bi-journal-check" />
                            <span>Dr 1210 / Cr 2020</span>
                          </span>
                        ) : (
                          <span className="text-muted small">Pending Voucher</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUB-TAB 4: ISSUES & TRANSFERS */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'movements' && (
        <div className="d-flex flex-column gap-3">
          {/* Movement Type Toggle */}
          <div className="d-flex justify-content-between align-items-center">
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className={`btn px-3 fw-semibold ${movementSubTab === 'issues' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setMovementSubTab('issues')}
              >
                <i className="bi bi-box-arrow-up-right me-1" />
                Departmental Issues ({issues.length})
              </button>
              <button
                type="button"
                className={`btn px-3 fw-semibold ${movementSubTab === 'transfers' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setMovementSubTab('transfers')}
              >
                <i className="bi bi-arrow-left-right me-1" />
                Inter-Warehouse Transfers ({transfers.length})
              </button>
            </div>

            {movementSubTab === 'issues' ? (
              <button
                type="button"
                className="btn btn-primary btn-sm fw-semibold d-flex align-items-center gap-1"
                onClick={() => setShowAddIssueModal(true)}
              >
                <i className="bi bi-plus-lg" />
                <span>Issue Material to Dept</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm fw-semibold d-flex align-items-center gap-1"
                onClick={() => setShowAddTransferModal(true)}
              >
                <i className="bi bi-plus-lg" />
                <span>New Warehouse Transfer</span>
              </button>
            )}
          </div>

          {/* Departmental Issues Table */}
          {movementSubTab === 'issues' && (
            <div className="card shadow-sm border-0">
              <div className="table-responsive">
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted ps-3">Issue Number</th>
                      <th className="small text-muted">Source Warehouse</th>
                      <th className="small text-muted">Department</th>
                      <th className="small text-muted">Issue Date</th>
                      <th className="small text-muted">Purpose / Requisition</th>
                      <th className="small text-muted text-end">Total Value</th>
                      <th className="small text-muted text-center pe-3">GL Posting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issuesLoading ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-muted small">
                          Loading material issues...
                        </td>
                      </tr>
                    ) : issues.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-muted small">
                          No material issues recorded yet.
                        </td>
                      </tr>
                    ) : (
                      issues.map((iss) => (
                        <tr key={iss.id}>
                          <td className="ps-3 font-monospace small fw-bold text-primary">{iss.issueNo}</td>
                          <td className="small text-muted">{iss.warehouseName}</td>
                          <td>
                            <span className="badge bg-light text-dark border small">{iss.department}</span>
                          </td>
                          <td className="small text-muted">{iss.issueDate}</td>
                          <td className="small text-muted">{iss.purpose || 'Department Requisition'}</td>
                          <td className="text-end tabular-nums small fw-bold text-dark">
                            ${Number(iss.totalAmount).toFixed(2)}
                          </td>
                          <td className="text-center pe-3">
                            <span className="badge bg-primary-subtle text-primary border border-primary-subtle small d-inline-flex align-items-center gap-1">
                              <i className="bi bi-journal-check" />
                              <span>Dr Dept Exp / Cr 1210</span>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inter-Warehouse Transfers Table */}
          {movementSubTab === 'transfers' && (
            <div className="card shadow-sm border-0">
              <div className="table-responsive">
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small text-muted ps-3">Transfer Number</th>
                      <th className="small text-muted">From Warehouse</th>
                      <th className="small text-muted">To Warehouse</th>
                      <th className="small text-muted">Transfer Date</th>
                      <th className="small text-muted">Notes</th>
                      <th className="small text-muted text-end">Total Value</th>
                      <th className="small text-muted text-center pe-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfersLoading ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-muted small">
                          Loading transfers...
                        </td>
                      </tr>
                    ) : transfers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-4 text-muted small">
                          No inter-warehouse transfers recorded yet.
                        </td>
                      </tr>
                    ) : (
                      transfers.map((tr) => (
                        <tr key={tr.id}>
                          <td className="ps-3 font-monospace small fw-bold text-primary">{tr.transferNo}</td>
                          <td className="small text-muted fw-semibold">{tr.sourceWarehouseName}</td>
                          <td className="small text-dark fw-semibold">{tr.targetWarehouseName}</td>
                          <td className="small text-muted">{tr.transferDate}</td>
                          <td className="small text-muted">{tr.notes || 'Stock Replenishment'}</td>
                          <td className="text-end tabular-nums small fw-bold text-dark">
                            ${Number(tr.totalAmount).toFixed(2)}
                          </td>
                          <td className="text-center pe-3">
                            <span className="badge bg-success-subtle text-success border border-success-subtle small">
                              Completed
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUB-TAB 5: STOCK COUNTS & AUDITS */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'audit' && (
        <div className="d-flex flex-column gap-3">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-clipboard2-check text-primary fs-5" />
                <span className="fw-bold text-dark">Physical Stock Counts & Audits</span>
                <span className="badge bg-light text-dark border ms-2">{stockCounts.length} Count Sheets</span>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm fw-semibold d-flex align-items-center gap-1 shadow-sm"
                onClick={() => setShowAddCountModal(true)}
              >
                <i className="bi bi-camera" />
                <span>Freeze Snapshot / New Count Sheet</span>
              </button>
            </div>

            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small text-muted ps-3">Count Number</th>
                    <th className="small text-muted">Warehouse</th>
                    <th className="small text-muted">Snapshot Date</th>
                    <th className="small text-muted text-center">Blind Count</th>
                    <th className="small text-muted text-center">Status</th>
                    <th className="small text-muted text-end">Total Variance Value</th>
                    <th className="small text-muted text-center pe-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {countsLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted small">
                        Loading physical stock counts...
                      </td>
                    </tr>
                  ) : stockCounts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4 text-muted small">
                        No stock count audits recorded. Click &quot;Freeze Snapshot&quot; to start an audit.
                      </td>
                    </tr>
                  ) : (
                    stockCounts.map((sc) => (
                      <tr key={sc.id}>
                        <td className="ps-3 font-monospace small fw-bold text-primary">{sc.countNo}</td>
                        <td className="small text-dark fw-semibold">{sc.warehouseName}</td>
                        <td className="small text-muted">{sc.countDate}</td>
                        <td className="text-center small">
                          {sc.isBlind ? (
                            <span className="badge bg-secondary-subtle text-secondary border small">Blind</span>
                          ) : (
                            <span className="badge bg-light text-muted border small">Standard</span>
                          )}
                        </td>
                        <td className="text-center">
                          {sc.status === 'completed' ? (
                            <span className="badge bg-success-subtle text-success border border-success-subtle small">
                              Reconciled & Adjusted
                            </span>
                          ) : sc.status === 'in_progress' ? (
                            <span className="badge bg-info-subtle text-info border border-info-subtle small">
                              In Progress
                            </span>
                          ) : (
                            <span className="badge bg-warning-subtle text-warning border border-warning-subtle small">
                              Draft Frozen
                            </span>
                          )}
                        </td>
                        <td className="text-end tabular-nums small fw-bold">
                          {sc.totalVarianceCost !== 0 ? (
                            <span className="text-danger">${Number(sc.totalVarianceCost).toFixed(2)}</span>
                          ) : (
                            <span className="text-success">$0.00</span>
                          )}
                        </td>
                        <td className="text-center pe-3">
                          {sc.status !== 'completed' ? (
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm py-0 px-2 fw-semibold"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                setSelectedCountForEntry(sc);
                                // Initialize count inputs with existing countedQty or snapshotQty
                                const init: Record<string, number> = {};
                                sc.lines?.forEach((l) => {
                                  init[l.itemId] = l.countedQty !== null ? l.countedQty : l.snapshotQty;
                                });
                                setCountInputs(init);
                              }}
                            >
                              <i className="bi bi-pencil-square me-1" />
                              Count & Reconcile
                            </button>
                          ) : (
                            <span className="text-muted small">
                              <i className="bi bi-check2-circle text-success me-1" />
                              Approved
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* SUB-TAB 6: VALUATION & GL RECONCILIATION */}
      {/* -------------------------------------------------------------------- */}
      {activeTab === 'valuation' && (
        <div className="d-flex flex-column gap-4">
          {/* GL Balance Comparison Alert Card */}
          <div className="card shadow-sm border-0 p-4 bg-white">
            <h5 className="fw-bold text-dark d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-balance text-primary" />
              Real-Time Stock Valuation vs General Ledger Control Sync
            </h5>

            <div className="row g-4 align-items-center">
              <div className="col-12 col-md-4">
                <div className="p-3 bg-light rounded-3 border">
                  <div className="text-muted small fw-semibold">Physical Inventory Valuation</div>
                  <div className="fs-3 fw-bold text-dark tabular-nums mt-1">
                    ${Number(valuationReport?.totalPhysicalValuation || 0).toFixed(2)}
                  </div>
                  <div className="text-muted small mt-1">Sum of all stock balances (Qty × WAC Rate)</div>
                </div>
              </div>

              <div className="col-12 col-md-4">
                <div className="p-3 bg-light rounded-3 border">
                  <div className="text-muted small fw-semibold">GL Inventory Control Account (1210 / 1220)</div>
                  <div className="fs-3 fw-bold text-primary tabular-nums mt-1">
                    ${Number(valuationReport?.glInventoryControlBalance || 0).toFixed(2)}
                  </div>
                  <div className="text-muted small mt-1">Current balance in General Ledger</div>
                </div>
              </div>

              <div className="col-12 col-md-4">
                <div className={`p-3 rounded-3 border ${valuationReport?.isReconciled ? 'bg-success-subtle border-success-subtle' : 'bg-danger-subtle border-danger-subtle'}`}>
                  <div className="small fw-semibold text-uppercase">Reconciliation Difference</div>
                  <div className={`fs-3 fw-bold tabular-nums mt-1 ${valuationReport?.isReconciled ? 'text-success' : 'text-danger'}`}>
                    ${Number(valuationReport?.variance || 0).toFixed(2)}
                  </div>
                  <div className="small mt-1 fw-bold">
                    {valuationReport?.isReconciled ? (
                      <span className="text-success d-flex align-items-center gap-1">
                        <i className="bi bi-shield-check" /> Perfect Match — 100% Reconciled
                      </span>
                    ) : (
                      <span className="text-danger d-flex align-items-center gap-1">
                        <i className="bi bi-exclamation-triangle" /> Variance requires adjustment
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Immutable Stock Ledger Trail */}
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-clock-history text-primary fs-5" />
                <span className="fw-bold text-dark">
                  Append-Only Stock Ledger Audit Trail
                  {selectedItemForLedger && ` (Filtered: ${selectedItemForLedger.name} - ${selectedItemForLedger.code})`}
                </span>
                <span className="badge bg-light text-dark border ms-2">{ledgerEntries.length} Ledger Events</span>
              </div>

              {selectedItemForLedger && (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setSelectedItemForLedger(null)}
                >
                  Clear Item Filter
                </button>
              )}
            </div>

            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: '0.85rem' }}>
                <thead className="table-light">
                  <tr>
                    <th className="small text-muted ps-3">Timestamp</th>
                    <th className="small text-muted">Doc Type</th>
                    <th className="small text-muted">Item</th>
                    <th className="small text-muted">Warehouse</th>
                    <th className="small text-muted text-end">Qty Delta</th>
                    <th className="small text-muted text-end">Unit Cost</th>
                    <th className="small text-muted text-end">Balance Qty</th>
                    <th className="small text-muted text-end">Balance Value</th>
                    <th className="small text-muted text-end pe-3">WAC Valuation Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerLoading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-4 text-muted small">
                        Loading immutable stock ledger...
                      </td>
                    </tr>
                  ) : ledgerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-4 text-muted small">
                        No ledger movements recorded.
                      </td>
                    </tr>
                  ) : (
                    ledgerEntries.slice(0, 30).map((entry) => (
                      <tr key={entry.id}>
                        <td className="ps-3 small text-muted">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td>
                          <span
                            className={`badge border text-uppercase ${
                              entry.docType === 'grn'
                                ? 'bg-success-subtle text-success border-success-subtle'
                                : entry.docType === 'issue'
                                ? 'bg-danger-subtle text-danger border-danger-subtle'
                                : entry.docType === 'transfer'
                                ? 'bg-info-subtle text-info border-info-subtle'
                                : 'bg-warning-subtle text-warning border-warning-subtle'
                            }`}
                            style={{ fontSize: '0.68rem' }}
                          >
                            {entry.docType}
                          </span>
                        </td>
                        <td className="fw-semibold text-dark small">{entry.itemName}</td>
                        <td className="small text-muted">{entry.warehouseName}</td>
                        <td
                          className={`text-end tabular-nums fw-bold small ${
                            Number(entry.qtyDelta) >= 0 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {Number(entry.qtyDelta) > 0 ? `+${Number(entry.qtyDelta).toFixed(2)}` : Number(entry.qtyDelta).toFixed(2)}
                        </td>
                        <td className="text-end tabular-nums small text-muted">
                          ${Number(entry.unitCost).toFixed(2)}
                        </td>
                        <td className="text-end tabular-nums small text-dark fw-bold">
                          {Number(entry.balanceQty).toFixed(2)}
                        </td>
                        <td className="text-end tabular-nums small text-dark">
                          ${Number(entry.balanceValue).toFixed(2)}
                        </td>
                        <td className="text-end tabular-nums small fw-bold text-primary pe-3">
                          ${Number(entry.valuationRate).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: ADD MASTER ITEM */}
      {/* ==================================================================== */}
      {showAddItemModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-tag text-primary" />
                  Create Master Inventory Item
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddItemModal(false)}
                />
              </div>
              <div className="modal-body">
                {createItemMutation.isError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {(createItemMutation.error as Error).message}
                  </div>
                )}
                <div className="row g-3">
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Item Code / SKU</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. ITM-SALMON"
                      value={newItemCode}
                      onChange={(e) => setNewItemCode(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Item Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. Atlantic Fresh Salmon"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Category</label>
                    <select
                      className="form-select form-select-sm"
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Base Unit of Measure (UoM)</label>
                    <select
                      className="form-select form-select-sm"
                      value={newItemBaseUom}
                      onChange={(e) => setNewItemBaseUom(e.target.value)}
                    >
                      {uoms.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Standard Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control form-control-sm"
                      value={newItemStandardCost}
                      onChange={(e) => setNewItemStandardCost(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Reorder Point</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control form-control-sm"
                      value={newItemReorderPoint}
                      onChange={(e) => setNewItemReorderPoint(e.target.value)}
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold text-dark">Default Storage Warehouse</label>
                    <select
                      className="form-select form-select-sm"
                      value={newItemWarehouse}
                      onChange={(e) => setNewItemWarehouse(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShowAddItemModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-semibold"
                  disabled={!newItemCode.trim() || !newItemName.trim() || createItemMutation.isPending}
                  onClick={() => createItemMutation.mutate()}
                >
                  {createItemMutation.isPending ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: RECEIVE GOODS NOTE (GRN) */}
      {/* ==================================================================== */}
      {showAddGrnModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-truck text-primary" />
                  Receive Goods Note (GRN) &amp; Automated Posting
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddGrnModal(false)}
                />
              </div>
              <div className="modal-body">
                {createGrnMutation.isError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {(createGrnMutation.error as Error).message}
                  </div>
                )}
                <div className="row g-3 mb-3">
                  <div className="col-12 col-sm-4">
                    <label className="form-label small fw-semibold text-dark">Supplier</label>
                    <select
                      className="form-select form-select-sm"
                      value={grnSupplierId}
                      onChange={(e) => setGrnSupplierId(e.target.value)}
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-sm-4">
                    <label className="form-label small fw-semibold text-dark">Receiving Warehouse</label>
                    <select
                      className="form-select form-select-sm"
                      value={grnWarehouseId}
                      onChange={(e) => setGrnWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-sm-4">
                    <label className="form-label small fw-semibold text-dark">Supplier Invoice / Delivery Ref</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. INV-99081"
                      value={grnInvoiceRef}
                      onChange={(e) => setGrnInvoiceRef(e.target.value)}
                    />
                  </div>
                </div>

                <div className="border rounded p-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-bold small text-dark">Received Line Items</span>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm py-0 px-2"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() =>
                        setGrnLines([
                          ...grnLines,
                          { itemId: items[0]?.id || '', qty: 5, unitCost: Number(items[0]?.standardCost) || 10 },
                        ])
                      }
                    >
                      <i className="bi bi-plus-lg me-1" />
                      Add Line
                    </button>
                  </div>

                  {grnLines.map((line, idx) => (
                    <div key={idx} className="row g-2 align-items-center mb-2">
                      <div className="col-5">
                        <select
                          className="form-select form-select-sm"
                          value={line.itemId}
                          onChange={(e) => {
                            const selected = items.find((i) => i.id === e.target.value);
                            const updated = [...grnLines];
                            updated[idx].itemId = e.target.value;
                            if (selected) updated[idx].unitCost = Number(selected.standardCost) || 10;
                            setGrnLines(updated);
                          }}
                        >
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.code} — {i.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Qty"
                          className="form-control form-control-sm"
                          value={line.qty}
                          onChange={(e) => {
                            const updated = [...grnLines];
                            updated[idx].qty = parseFloat(e.target.value) || 0;
                            setGrnLines(updated);
                          }}
                        />
                      </div>
                      <div className="col-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Unit Cost ($)"
                          className="form-control form-control-sm"
                          value={line.unitCost}
                          onChange={(e) => {
                            const updated = [...grnLines];
                            updated[idx].unitCost = parseFloat(e.target.value) || 0;
                            setGrnLines(updated);
                          }}
                        />
                      </div>
                      <div className="col-1 text-center">
                        {grnLines.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm py-0 px-1"
                            onClick={() => setGrnLines(grnLines.filter((_, i) => i !== idx))}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="d-flex justify-content-between align-items-center border-top pt-2 mt-2">
                    <span className="small text-muted">
                      Total GRN Value:
                    </span>
                    <span className="fw-bold tabular-nums text-dark">
                      $
                      {grnLines
                        .reduce((sum, l) => sum + (l.qty || 0) * (l.unitCost || 0), 0)
                        .toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="alert alert-info py-2 small mt-3 mb-0 d-flex align-items-center gap-2">
                  <i className="bi bi-info-circle-fill" />
                  <span>
                    Confirming this GRN atomically adjusts warehouse stock, updates WAC rates, and posts a balanced voucher:
                    <strong> Dr Inventory (1210) / Cr GRNI (2020)</strong>.
                  </span>
                </div>
              </div>
              <div className="modal-footer border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShowAddGrnModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-semibold"
                  disabled={createGrnMutation.isPending}
                  onClick={() => createGrnMutation.mutate()}
                >
                  {createGrnMutation.isPending ? 'Processing GRN...' : 'Post Goods Receipt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: MATERIAL ISSUE */}
      {/* ==================================================================== */}
      {showAddIssueModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-box-arrow-up-right text-primary" />
                  Issue Stock to Department
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddIssueModal(false)}
                />
              </div>
              <div className="modal-body">
                {createIssueMutation.isError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {(createIssueMutation.error as Error).message}
                  </div>
                )}
                <div className="row g-3 mb-3">
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Source Warehouse</label>
                    <select
                      className="form-select form-select-sm"
                      value={issueWarehouseId}
                      onChange={(e) => setIssueWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Target Department</label>
                    <select
                      className="form-select form-select-sm"
                      value={issueDepartment}
                      onChange={(e) => setIssueDepartment(e.target.value)}
                    >
                      <option value="Kitchen">Kitchen (Main Restaurant)</option>
                      <option value="Bar">Bar &amp; Lounge</option>
                      <option value="Housekeeping">Housekeeping Operations</option>
                      <option value="Maintenance">Maintenance &amp; Facilities</option>
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold text-dark">Purpose / Requisition Notes</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. Daily Dinner Service Prep"
                      value={issuePurpose}
                      onChange={(e) => setIssuePurpose(e.target.value)}
                    />
                  </div>
                </div>

                <div className="border rounded p-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-bold small text-dark">Issue Items</span>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm py-0 px-2"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() =>
                        setIssueLines([...issueLines, { itemId: items[0]?.id || '', qty: 1 }])
                      }
                    >
                      <i className="bi bi-plus-lg me-1" />
                      Add Line
                    </button>
                  </div>

                  {issueLines.map((line, idx) => (
                    <div key={idx} className="row g-2 align-items-center mb-2">
                      <div className="col-8">
                        <select
                          className="form-select form-select-sm"
                          value={line.itemId}
                          onChange={(e) => {
                            const updated = [...issueLines];
                            updated[idx].itemId = e.target.value;
                            setIssueLines(updated);
                          }}
                        >
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.code} — {i.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Qty"
                          className="form-control form-control-sm"
                          value={line.qty}
                          onChange={(e) => {
                            const updated = [...issueLines];
                            updated[idx].qty = parseFloat(e.target.value) || 0;
                            setIssueLines(updated);
                          }}
                        />
                      </div>
                      <div className="col-1 text-center">
                        {issueLines.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm py-0 px-1"
                            onClick={() => setIssueLines(issueLines.filter((_, i) => i !== idx))}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShowAddIssueModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-semibold"
                  disabled={createIssueMutation.isPending}
                  onClick={() => createIssueMutation.mutate()}
                >
                  {createIssueMutation.isPending ? 'Posting...' : 'Confirm Issue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: INTER-WAREHOUSE TRANSFER */}
      {/* ==================================================================== */}
      {showAddTransferModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-arrow-left-right text-primary" />
                  Inter-Warehouse Stock Transfer
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddTransferModal(false)}
                />
              </div>
              <div className="modal-body">
                {createTransferMutation.isError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {(createTransferMutation.error as Error).message}
                  </div>
                )}
                <div className="row g-3 mb-3">
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Source Warehouse</label>
                    <select
                      className="form-select form-select-sm"
                      value={transferSourceWarehouseId}
                      onChange={(e) => setTransferSourceWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12 col-sm-6">
                    <label className="form-label small fw-semibold text-dark">Destination Warehouse</label>
                    <select
                      className="form-select form-select-sm"
                      value={transferTargetWarehouseId}
                      onChange={(e) => setTransferTargetWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold text-dark">Transfer Notes</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. Daily Bar Restock from Central Store"
                      value={transferNotes}
                      onChange={(e) => setTransferNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="border rounded p-3 bg-light">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-bold small text-dark">Items to Transfer</span>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm py-0 px-2"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() =>
                        setTransferLines([...transferLines, { itemId: items[0]?.id || '', qty: 1 }])
                      }
                    >
                      <i className="bi bi-plus-lg me-1" />
                      Add Line
                    </button>
                  </div>

                  {transferLines.map((line, idx) => (
                    <div key={idx} className="row g-2 align-items-center mb-2">
                      <div className="col-8">
                        <select
                          className="form-select form-select-sm"
                          value={line.itemId}
                          onChange={(e) => {
                            const updated = [...transferLines];
                            updated[idx].itemId = e.target.value;
                            setTransferLines(updated);
                          }}
                        >
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.code} — {i.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Qty"
                          className="form-control form-control-sm"
                          value={line.qty}
                          onChange={(e) => {
                            const updated = [...transferLines];
                            updated[idx].qty = parseFloat(e.target.value) || 0;
                            setTransferLines(updated);
                          }}
                        />
                      </div>
                      <div className="col-1 text-center">
                        {transferLines.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm py-0 px-1"
                            onClick={() => setTransferLines(transferLines.filter((_, i) => i !== idx))}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShowAddTransferModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-semibold"
                  disabled={createTransferMutation.isPending || transferSourceWarehouseId === transferTargetWarehouseId}
                  onClick={() => createTransferMutation.mutate()}
                >
                  {createTransferMutation.isPending ? 'Transferring...' : 'Execute Transfer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: FREEZE SNAPSHOT / CREATE COUNT SHEET */}
      {/* ==================================================================== */}
      {showAddCountModal && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-camera text-primary" />
                  Freeze Snapshot for Physical Count
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAddCountModal(false)}
                />
              </div>
              <div className="modal-body">
                {createCountMutation.isError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {(createCountMutation.error as Error).message}
                  </div>
                )}
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small fw-semibold text-dark">Select Warehouse to Audit</label>
                    <select
                      className="form-select form-select-sm"
                      value={countWarehouseId}
                      onChange={(e) => setCountWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-12">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="blindCheck"
                        checked={countIsBlind}
                        onChange={(e) => setCountIsBlind(e.target.checked)}
                      />
                      <label className="form-check-label small text-dark fw-semibold" htmlFor="blindCheck">
                        Blind Count Sheet (Hides expected system quantity from counter)
                      </label>
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold text-dark">Audit Scope / Notes</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g. End of Month Stocktake"
                      value={countNotes}
                      onChange={(e) => setCountNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShowAddCountModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary fw-semibold"
                  disabled={createCountMutation.isPending}
                  onClick={() => createCountMutation.mutate()}
                >
                  {createCountMutation.isPending ? 'Freezing...' : 'Create Count Sheet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 6: ENTER PHYSICAL COUNTS & RECONCILE */}
      {/* ==================================================================== */}
      {selectedCountForEntry && (
        <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0 shadow">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-pencil-square text-primary" />
                  Physical Count Entry &amp; Audit ({selectedCountForEntry.countNo})
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSelectedCountForEntry(null)}
                />
              </div>
              <div className="modal-body">
                {submitCountLinesMutation.isError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {(submitCountLinesMutation.error as Error).message}
                  </div>
                )}
                {reconcileCountMutation.isError && (
                  <div className="alert alert-danger py-2 small mb-3">
                    {(reconcileCountMutation.error as Error).message}
                  </div>
                )}

                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div className="small text-muted">
                    Warehouse: <strong>{selectedCountForEntry.warehouseName}</strong> · Date: {selectedCountForEntry.countDate}
                  </div>
                  {selectedCountForEntry.isBlind && (
                    <span className="badge bg-secondary-subtle text-secondary border small">Blind Audit Mode</span>
                  )}
                </div>

                <div className="table-responsive" style={{ maxHeight: '350px' }}>
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="small text-muted ps-2">Item</th>
                        {!selectedCountForEntry.isBlind && (
                          <th className="small text-muted text-end">Snapshot Qty</th>
                        )}
                        <th className="small text-muted text-center" style={{ width: '130px' }}>Counted Qty</th>
                        {!selectedCountForEntry.isBlind && (
                          <>
                            <th className="small text-muted text-end">Variance</th>
                            <th className="small text-muted text-end pe-2">Variance ($)</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCountForEntry.lines?.map((line) => {
                        const entered = countInputs[line.itemId] ?? line.countedQty ?? line.snapshotQty;
                        const variance = entered - line.snapshotQty;
                        const varCost = variance * Number(line.unitCost);

                        return (
                          <tr key={line.itemId}>
                            <td className="ps-2 small fw-semibold text-dark">
                              <div>{line.itemName}</div>
                              <span className="font-monospace text-muted" style={{ fontSize: '0.75rem' }}>
                                {line.itemCode}
                              </span>
                            </td>
                            {!selectedCountForEntry.isBlind && (
                              <td className="text-end tabular-nums small text-muted">
                                {Number(line.snapshotQty).toFixed(2)} {line.uomCode}
                              </td>
                            )}
                            <td className="text-center">
                              <input
                                type="number"
                                step="0.01"
                                className="form-control form-control-sm text-center fw-bold"
                                value={entered}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setCountInputs({ ...countInputs, [line.itemId]: val });
                                }}
                              />
                            </td>
                            {!selectedCountForEntry.isBlind && (
                              <>
                                <td
                                  className={`text-end tabular-nums small fw-bold ${
                                    variance < 0 ? 'text-danger' : variance > 0 ? 'text-success' : 'text-muted'
                                  }`}
                                >
                                  {variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)}
                                </td>
                                <td
                                  className={`text-end tabular-nums small fw-bold pe-2 ${
                                    varCost < 0 ? 'text-danger' : varCost > 0 ? 'text-success' : 'text-muted'
                                  }`}
                                >
                                  ${varCost.toFixed(2)}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer border-top d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setSelectedCountForEntry(null)}
                >
                  Close
                </button>
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary fw-semibold"
                    disabled={submitCountLinesMutation.isPending}
                    onClick={() => submitCountLinesMutation.mutate(selectedCountForEntry.id)}
                  >
                    {submitCountLinesMutation.isPending ? 'Saving...' : 'Save Physical Counts'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-success fw-semibold"
                    disabled={reconcileCountMutation.isPending}
                    onClick={() => reconcileCountMutation.mutate(selectedCountForEntry.id)}
                  >
                    {reconcileCountMutation.isPending ? 'Reconciling...' : 'Approve & Adjust Stock'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
