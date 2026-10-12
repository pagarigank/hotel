import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';

// Interfaces for Master Data & POS
export interface Outlet {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  name: string;
  outletType: 'restaurant' | 'bar' | 'cafe' | 'room_service' | 'banquet';
  warehouseId?: string;
  depletionMode: 'at_order' | 'at_fire' | 'at_settle';
  isActive: boolean;
}

export interface KitchenStation {
  id: string;
  outletId: string;
  code: string;
  name: string;
}

export interface DiningTable {
  id: string;
  outletId: string;
  tableNumber: string;
  capacity: number;
  status: 'free' | 'seated' | 'ordered' | 'billed' | 'dirty';
  currentOrderId?: string | null;
}

export interface MenuCategory {
  id: string;
  outletId: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  outletId: string;
  categoryId: string;
  categoryName?: string;
  kitchenStationId?: string;
  stationCode?: string;
  stationName?: string;
  code: string;
  name: string;
  description?: string;
  basePrice: number;
  taxRate: number;
  serviceChargeRate: number;
  isAvailable: boolean;
  hasRecipe: boolean;
}

export interface PosOrderLine {
  id: string;
  lineNo: number;
  menuItemId: string;
  menuItemCode: string;
  menuItemName: string;
  stationCode?: string;
  stationName?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  seatNo: number;
  course: 'drinks' | 'appetizer' | 'main' | 'dessert';
  status: 'pending' | 'fired' | 'served' | 'voided';
  notes?: string;
  voidReason?: string;
}

export interface PosOrder {
  id: string;
  outletId: string;
  outletName?: string;
  tableId?: string | null;
  tableNumber?: string | null;
  shiftId?: string | null;
  orderNo: string;
  covers: number;
  status: 'open' | 'fired' | 'billed' | 'settled' | 'voided';
  subtotal: number;
  taxAmount: number;
  serviceChargeAmount: number;
  totalAmount: number;
  notes?: string;
  createdAt: string;
  lines: PosOrderLine[];
}

export interface KotLine {
  id: string;
  orderLineId: string;
  menuItemId: string;
  menuItemName?: string;
  quantity: number;
  notes?: string;
}

export interface Kot {
  id: string;
  outletId: string;
  stationId?: string | null;
  stationName?: string;
  orderId: string;
  tableNumber?: string | null;
  kotNo: string;
  isVoid: boolean;
  status: 'pending' | 'cooking' | 'ready' | 'collected' | 'voided';
  firedAt: string;
  lines: KotLine[];
}

export interface PosBillPayment {
  id: string;
  paymentMethod: 'cash' | 'card' | 'qr' | 'room_charge' | 'city_ledger';
  amount: number;
  tenderReference?: string;
  stayId?: string | null;
  folioId?: string | null;
  folioLineId?: string | null;
}

export interface PosBill {
  id: string;
  outletId: string;
  orderId: string;
  tableNumber?: string;
  billNo: string;
  subtotal: number;
  discountAmount: number;
  serviceChargeAmount: number;
  taxAmount: number;
  tipAmount: number;
  totalAmount: number;
  paidAmount: number;
  status: 'open' | 'paid' | 'voided';
  revenueVoucherId?: string | null;
  cogsVoucherId?: string | null;
  createdAt: string;
  settledAt?: string | null;
  payments?: PosBillPayment[];
}

export interface PosShift {
  id: string;
  shiftNo: string;
  openedAt: string;
  closedAt?: string | null;
  openingFloat: number;
  cashDrops: number;
  cashPayments: number;
  closingCash?: number | null;
  expectedCash?: number | null;
  variance?: number | null;
  voucherId?: string | null;
  status: 'open' | 'closed';
  userName?: string;
}

export interface InHouseGuestLookup {
  stayId: string;
  folioId: string;
  guestId: string;
  guestName: string;
  unitId: string;
  unitNumber: string;
}

export const RestaurantView: React.FC = () => {
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId } = useAppStore();

  // Navigation Sub-tab
  const [activeTab, setActiveTab] = useState<'tables' | 'order' | 'kds' | 'bills' | 'shifts'>('tables');

  // Selected state
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [activeOrder, setActiveOrder] = useState<PosOrder | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeKdsStation, setActiveKdsStation] = useState<string>('all');

  // Modals state
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [activeBill, setActiveBill] = useState<PosBill | null>(null);
  const [settleMethod, setSettleMethod] = useState<'cash' | 'card' | 'qr' | 'room_charge'>('room_charge');
  const [selectedGuestFolio, setSelectedGuestFolio] = useState<InHouseGuestLookup | null>(null);
  const [guestSearchQuery, setGuestSearchQuery] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [cashTendered, setCashTendered] = useState(0);

  // Shift Modals
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState(150);
  const [isCashDropModalOpen, setIsCashDropModalOpen] = useState(false);
  const [cashDropAmount, setCashDropAmount] = useState(50);
  const [cashDropReason, setCashDropReason] = useState('Mid-shift safe drop');
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [closingCashInput, setClosingCashInput] = useState(100);

  // Cart / Pending Line State for Ordering
  const [cartItems, setCartItems] = useState<
    Array<{
      menuItem: MenuItem;
      quantity: number;
      seatNo: number;
      course: 'drinks' | 'appetizer' | 'main' | 'dessert';
      notes: string;
    }>
  >([]);
  const [orderCovers, setOrderCovers] = useState(2);
  const [currentSeat, setCurrentSeat] = useState(1);
  const [currentCourse, setCurrentCourse] = useState<'drinks' | 'appetizer' | 'main' | 'dessert'>('main');

  // Notification Banner
  const [banner, setBanner] = useState<{ type: 'success' | 'danger' | 'info'; message: string } | null>(null);

  const showBanner = (type: 'success' | 'danger' | 'info', message: string) => {
    setBanner({ type, message });
    setTimeout(() => setBanner(null), 6000);
  };

  // 1. Fetch Outlets
  const { data: outlets = [], isLoading: isLoadingOutlets } = useQuery<Outlet[]>({
    queryKey: ['fnb-outlets', activeTenantId, activeBranchId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/outlets?branchId=${activeBranchId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load outlets');
      const data = await res.json();
      if (data.length > 0 && !selectedOutletId) {
        setSelectedOutletId(data[0].id);
      }
      return data;
    },
  });

  const currentOutlet = outlets.find((o) => o.id === selectedOutletId) || outlets[0];
  const effectiveOutletId = currentOutlet?.id || selectedOutletId;

  // 2. Fetch Dining Tables
  const { data: tables = [], isLoading: isLoadingTables } = useQuery<DiningTable[]>({
    queryKey: ['fnb-tables', activeTenantId, effectiveOutletId],
    enabled: !!effectiveOutletId,
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/tables?outletId=${effectiveOutletId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load dining tables');
      return res.json();
    },
  });

  // 3. Fetch Kitchen Stations
  const { data: stations = [] } = useQuery<KitchenStation[]>({
    queryKey: ['fnb-stations', activeTenantId, effectiveOutletId],
    enabled: !!effectiveOutletId,
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/kitchen-stations?outletId=${effectiveOutletId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load stations');
      return res.json();
    },
  });

  // 4. Fetch Menu Categories & Items
  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['fnb-categories', activeTenantId, effectiveOutletId],
    enabled: !!effectiveOutletId,
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/categories?outletId=${effectiveOutletId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load categories');
      return res.json();
    },
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['fnb-items', activeTenantId, effectiveOutletId],
    enabled: !!effectiveOutletId,
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/items?outletId=${effectiveOutletId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load menu items');
      return res.json();
    },
  });

  // 5. Fetch Current POS Shift
  const { data: currentShift, refetch: refetchShift } = useQuery<PosShift | null>({
    queryKey: ['fnb-current-shift', activeTenantId, effectiveOutletId],
    enabled: !!effectiveOutletId,
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/shifts/current?outletId=${effectiveOutletId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  // 6. Fetch KOTs for KDS
  const { data: kots = [], refetch: refetchKots } = useQuery<Kot[]>({
    queryKey: ['fnb-kots', activeTenantId, effectiveOutletId],
    enabled: !!effectiveOutletId && activeTab === 'kds',
    refetchInterval: 5000,
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/kots?outletId=${effectiveOutletId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load KOTs');
      return res.json();
    },
  });

  // 7. Fetch Bills
  const { data: bills = [], refetch: refetchBills } = useQuery<PosBill[]>({
    queryKey: ['fnb-bills', activeTenantId, effectiveOutletId],
    enabled: !!effectiveOutletId && activeTab === 'bills',
    queryFn: async () => {
      const res = await fetch(`/api/v1/restaurant/bills?outletId=${effectiveOutletId}`, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to load bills');
      return res.json();
    },
  });

  // 8. In-House Guest Lookup Query
  const { data: inHouseGuests = [] } = useQuery<InHouseGuestLookup[]>({
    queryKey: ['fnb-in-house-guests', activeTenantId, activeBranchId, guestSearchQuery],
    enabled: isSettlementModalOpen && settleMethod === 'room_charge',
    queryFn: async () => {
      const url = `/api/v1/restaurant/in-house-guests?branchId=${activeBranchId}&search=${encodeURIComponent(guestSearchQuery)}`;
      const res = await fetch(url, {
        headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
      });
      if (!res.ok) throw new Error('Failed to lookup in-house guests');
      return res.json();
    },
  });

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  // Open Shift
  const openShiftMutation = useMutation({
    mutationFn: async (openingFloat: number) => {
      const res = await fetch('/api/v1/restaurant/shifts/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          branchId: activeBranchId,
          outletId: effectiveOutletId,
          openingFloat,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to open shift');
      }
      return res.json();
    },
    onSuccess: (data) => {
      showBanner('success', `POS Shift ${data.shiftNo} opened successfully with float $${data.openingFloat.toFixed(2)}.`);
      setIsOpenShiftModalOpen(false);
      refetchShift();
    },
    onError: (err: any) => showBanner('danger', err.message),
  });

  // Cash Drop
  const cashDropMutation = useMutation({
    mutationFn: async () => {
      if (!currentShift) throw new Error('No active shift');
      const res = await fetch(`/api/v1/restaurant/shifts/${currentShift.id}/cash-drop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          amount: cashDropAmount,
          reason: cashDropReason,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to record cash drop');
      }
      return res.json();
    },
    onSuccess: () => {
      showBanner('success', `Cash drop of $${cashDropAmount.toFixed(2)} recorded into safe.`);
      setIsCashDropModalOpen(false);
      refetchShift();
    },
    onError: (err: any) => showBanner('danger', err.message),
  });

  // Close Shift
  const closeShiftMutation = useMutation({
    mutationFn: async () => {
      if (!currentShift) throw new Error('No active shift');
      const res = await fetch(`/api/v1/restaurant/shifts/${currentShift.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          closingCash: closingCashInput,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to close shift');
      }
      return res.json();
    },
    onSuccess: (data) => {
      const varText = data.variance === 0 ? 'Balanced' : data.variance > 0 ? `Over (+$${data.variance.toFixed(2)})` : `Short (-$${Math.abs(data.variance).toFixed(2)})`;
      showBanner('success', `POS Shift ${data.shiftNo} closed. Cash status: ${varText}. Voucher generated.`);
      setIsCloseShiftModalOpen(false);
      refetchShift();
    },
    onError: (err: any) => showBanner('danger', err.message),
  });

  // 86 Toggle
  const toggle86Mutation = useMutation({
    mutationFn: async ({ itemId, isAvailable }: { itemId: string; isAvailable: boolean }) => {
      const res = await fetch(`/api/v1/restaurant/items/${itemId}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ isAvailable }),
      });
      if (!res.ok) throw new Error('Failed to toggle item availability');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fnb-items'] });
      showBanner('info', `${data.name} is now ${data.isAvailable ? 'Available' : "86'd (Out of Stock)"}`);
    },
  });

  // Table Status Update (e.g. Clean Dirty Table)
  const cleanTableMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const res = await fetch(`/api/v1/restaurant/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ status: 'free' }),
      });
      if (!res.ok) throw new Error('Failed to update table status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fnb-tables'] });
      showBanner('success', 'Table marked Clean and Ready for guests.');
    },
  });

  // Create POS Order
  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTable) throw new Error('Please select a dining table');
      const payload = {
        branchId: activeBranchId,
        outletId: effectiveOutletId,
        tableId: selectedTable.id,
        shiftId: currentShift?.id || null,
        covers: orderCovers,
        lines: cartItems.map((c) => ({
          menuItemId: c.menuItem.id,
          quantity: c.quantity,
          seatNo: c.seatNo,
          course: c.course,
          notes: c.notes,
        })),
      };

      const res = await fetch('/api/v1/restaurant/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create order');
      }
      return res.json();
    },
    onSuccess: (data: PosOrder) => {
      setActiveOrder(data);
      setCartItems([]);
      queryClient.invalidateQueries({ queryKey: ['fnb-tables'] });
      showBanner('success', `Order ${data.orderNo} created for Table ${selectedTable?.tableNumber}.`);
    },
    onError: (err: any) => showBanner('danger', err.message),
  });

  // Fire Order Lines to Kitchen (KDS)
  const fireOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/v1/restaurant/orders/${orderId}/fire`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to fire order to kitchen');
      }
      return res.json();
    },
    onSuccess: (kotsData) => {
      showBanner('success', `Fired ${kotsData.length} Kitchen Order Ticket(s) to stations.`);
      if (activeOrder) {
        setActiveOrder({ ...activeOrder, status: 'fired' });
      }
      queryClient.invalidateQueries({ queryKey: ['fnb-tables'] });
      queryClient.invalidateQueries({ queryKey: ['fnb-kots'] });
    },
    onError: (err: any) => showBanner('danger', err.message),
  });

  // Generate Bill
  const createBillMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch('/api/v1/restaurant/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({
          orderId,
          discountAmount,
          tipAmount,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create bill check');
      }
      return res.json();
    },
    onSuccess: (bill: PosBill) => {
      setActiveBill(bill);
      setIsSettlementModalOpen(true);
      queryClient.invalidateQueries({ queryKey: ['fnb-tables'] });
      queryClient.invalidateQueries({ queryKey: ['fnb-bills'] });
    },
    onError: (err: any) => showBanner('danger', err.message),
  });

  // Atomic Settle Bill
  const settleBillMutation = useMutation({
    mutationFn: async () => {
      if (!activeBill) throw new Error('No active bill to settle');
      let payments: any[] = [];

      if (settleMethod === 'room_charge') {
        if (!selectedGuestFolio) throw new Error('Please select an in-house guest room for room charge');
        payments.push({
          paymentMethod: 'room_charge',
          amount: activeBill.totalAmount,
          roomNumber: selectedGuestFolio.unitNumber,
          guestName: selectedGuestFolio.guestName,
        });
      } else {
        payments.push({
          paymentMethod: settleMethod,
          amount: activeBill.totalAmount,
          tenderReference: settleMethod === 'cash' ? `Cash Paid (Tendered: $${cashTendered || activeBill.totalAmount})` : 'Direct Electronic Tender',
        });
      }

      const res = await fetch(`/api/v1/restaurant/bills/${activeBill.id}/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ payments }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to settle bill');
      }
      return res.json();
    },
    onSuccess: (settledBill: PosBill) => {
      showBanner(
        'success',
        `Check ${settledBill.billNo} settled atomically! GL Revenue & COGS vouchers posted, inventory depleted at WAC, guest folio updated.`,
      );
      setIsSettlementModalOpen(false);
      setActiveBill(null);
      setActiveOrder(null);
      setSelectedTable(null);
      queryClient.invalidateQueries({ queryKey: ['fnb-tables'] });
      queryClient.invalidateQueries({ queryKey: ['fnb-bills'] });
      refetchShift();
    },
    onError: (err: any) => showBanner('danger', err.message),
  });

  // KOT Status Update (KDS stepper)
  const updateKotStatusMutation = useMutation({
    mutationFn: async ({ kotId, status }: { kotId: string; status: string }) => {
      const res = await fetch(`/api/v1/restaurant/kots/${kotId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': activeTenantId,
          'X-Branch-Id': activeBranchId,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update KOT status');
      return res.json();
    },
    onSuccess: () => {
      refetchKots();
    },
  });

  // Helper calculation for Cart
  const cartSubtotal = cartItems.reduce((acc, c) => acc + c.menuItem.basePrice * c.quantity, 0);
  const cartServiceCharge = Math.round(cartSubtotal * 0.10 * 100) / 100;
  const cartTax = Math.round(cartSubtotal * 0.12 * 100) / 100;
  const cartGrandTotal = Math.round((cartSubtotal + cartServiceCharge + cartTax) * 100) / 100;

  // Add Item to Cart
  const handleAddToCart = (item: MenuItem) => {
    if (!item.isAvailable) return;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.menuItem.id === item.id && i.seatNo === currentSeat && i.course === currentCourse);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          menuItem: item,
          quantity: 1,
          seatNo: currentSeat,
          course: currentCourse,
          notes: '',
        },
      ];
    });
  };

  const handleOpenTable = async (table: DiningTable) => {
    setSelectedTable(table);
    setCartItems([]);
    if (table.currentOrderId) {
      try {
        const res = await fetch(`/api/v1/restaurant/orders/${table.currentOrderId}`, {
          headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
        });
        if (res.ok) {
          const order = await res.json();
          setActiveOrder(order);
        }
      } catch {
        setActiveOrder(null);
      }
    } else {
      setActiveOrder(null);
    }
    setActiveTab('order');
  };

  // Status Badge Helper
  const getTableStatusBadge = (status: DiningTable['status']) => {
    switch (status) {
      case 'free':
        return <span className="badge bg-success-subtle text-success border border-success-subtle">Free</span>;
      case 'seated':
        return <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle">Seated</span>;
      case 'ordered':
        return <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Ordered</span>;
      case 'billed':
        return <span className="badge bg-primary-subtle text-primary border border-primary-subtle">Billed</span>;
      case 'dirty':
        return <span className="badge bg-danger-subtle text-danger border border-danger-subtle">Dirty</span>;
      default:
        return <span className="badge bg-secondary-subtle text-secondary">{status}</span>;
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto d-flex flex-column gap-3 bg-light min-vh-100">
      {/* 1. Header Toolbar */}
      <div className="bg-white p-3 rounded-3 shadow-sm border d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center"
            style={{ width: '44px', height: '44px' }}
          >
            <i className="bi bi-cup-hot-fill fs-4" />
          </div>
          <div>
            <h5 className="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              Restaurant & Food & Beverage POS
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle fs-6 py-1">Phase 7</span>
            </h5>
            <div className="text-muted small d-flex align-items-center gap-2">
              <span>High-speed touch order entry, recipe explosion WAC depletion & atomic guest folio billing</span>
            </div>
          </div>
        </div>

        {/* Outlet Switcher & POS Shift Status Pill */}
        <div className="d-flex align-items-center gap-2">
          {outlets.length > 0 && (
            <select
              className="form-select form-select-sm fw-semibold border-secondary-subtle"
              style={{ width: '220px' }}
              value={selectedOutletId}
              onChange={(e) => {
                setSelectedOutletId(e.target.value);
                setSelectedTable(null);
                setActiveOrder(null);
              }}
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.outletType.toUpperCase()})
                </option>
              ))}
            </select>
          )}

          {currentShift ? (
            <div className="dropdown">
              <button
                className="btn btn-sm btn-outline-success d-flex align-items-center gap-2 fw-semibold"
                data-bs-toggle="dropdown"
                onClick={() => setIsCloseShiftModalOpen(true)}
              >
                <i className="bi bi-cash-stack" />
                <span>Shift #{currentShift.shiftNo.split('-').pop()} Open</span>
                <span className="badge bg-success text-white">${currentShift.openingFloat.toFixed(0)} Float</span>
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm btn-primary d-flex align-items-center gap-2 fw-semibold"
              onClick={() => setIsOpenShiftModalOpen(true)}
            >
              <i className="bi bi-door-open" />
              <span>Open POS Shift</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div className={`alert alert-${banner.type} py-2 px-3 mb-0 small shadow-sm d-flex align-items-center justify-content-between`}>
          <div className="d-flex align-items-center gap-2">
            <i className={`bi bi-${banner.type === 'success' ? 'check-circle-fill' : 'exclamation-circle-fill'}`} />
            <span>{banner.message}</span>
          </div>
          <button type="button" className="btn-close btn-sm" onClick={() => setBanner(null)} />
        </div>
      )}

      {/* 2. Operational Sub-Tabs */}
      <ul className="nav nav-pills bg-white p-2 rounded-3 shadow-sm border gap-1">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link py-2 px-3 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'tables' ? 'active' : 'text-dark'}`}
            onClick={() => setActiveTab('tables')}
          >
            <i className="bi bi-grid-3x3" />
            <span>Table Floor Plan</span>
            <span className="badge bg-secondary-subtle text-secondary ms-1">{tables.length}</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link py-2 px-3 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'order' ? 'active' : 'text-dark'}`}
            onClick={() => setActiveTab('order')}
          >
            <i className="bi bi-phone-landscape" />
            <span>Touch POS Order Screen</span>
            {selectedTable && <span className="badge bg-warning text-dark ms-1">{selectedTable.tableNumber}</span>}
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link py-2 px-3 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'kds' ? 'active' : 'text-dark'}`}
            onClick={() => {
              setActiveTab('kds');
              refetchKots();
            }}
          >
            <i className="bi bi-tv" />
            <span>Kitchen Display System (KDS)</span>
            <span className="badge bg-danger ms-1">{kots.filter((k) => k.status !== 'collected' && k.status !== 'voided').length}</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link py-2 px-3 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'bills' ? 'active' : 'text-dark'}`}
            onClick={() => {
              setActiveTab('bills');
              refetchBills();
            }}
          >
            <i className="bi bi-receipt" />
            <span>Bills & Checks</span>
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link py-2 px-3 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'shifts' ? 'active' : 'text-dark'}`}
            onClick={() => setActiveTab('shifts')}
          >
            <i className="bi bi-safe2" />
            <span>Shift Cash Management</span>
          </button>
        </li>
      </ul>

      {/* ========================================================================== */}
      {/* VIEW 1: TABLE BOARD FLOOR PLAN (REQ-FNB-001) */}
      {/* ========================================================================== */}
      {activeTab === 'tables' && (
        <div className="d-flex flex-column gap-3">
          {/* Table summary stats bar */}
          <div className="row g-2">
            <div className="col">
              <div className="bg-white p-3 rounded-3 border shadow-sm text-center">
                <span className="text-muted small fw-bold text-uppercase">Total Tables</span>
                <h4 className="fw-bold mb-0 text-dark">{tables.length}</h4>
              </div>
            </div>
            <div className="col">
              <div className="bg-white p-3 rounded-3 border shadow-sm text-center">
                <span className="text-success small fw-bold text-uppercase">Free</span>
                <h4 className="fw-bold mb-0 text-success">{tables.filter((t) => t.status === 'free').length}</h4>
              </div>
            </div>
            <div className="col">
              <div className="bg-white p-3 rounded-3 border shadow-sm text-center">
                <span className="text-warning-emphasis small fw-bold text-uppercase">Ordered</span>
                <h4 className="fw-bold mb-0 text-warning-emphasis">{tables.filter((t) => t.status === 'ordered').length}</h4>
              </div>
            </div>
            <div className="col">
              <div className="bg-white p-3 rounded-3 border shadow-sm text-center">
                <span className="text-primary small fw-bold text-uppercase">Billed</span>
                <h4 className="fw-bold mb-0 text-primary">{tables.filter((t) => t.status === 'billed').length}</h4>
              </div>
            </div>
            <div className="col">
              <div className="bg-white p-3 rounded-3 border shadow-sm text-center">
                <span className="text-danger small fw-bold text-uppercase">Dirty</span>
                <h4 className="fw-bold mb-0 text-danger">{tables.filter((t) => t.status === 'dirty').length}</h4>
              </div>
            </div>
          </div>

          {/* Table Grid (Responsive Tile Board Pattern) */}
          {isLoadingTables ? (
            <div className="bg-white p-5 text-center text-muted rounded-3 border">Loading table floor plan...</div>
          ) : tables.length === 0 ? (
            <div className="bg-white p-5 text-center text-muted rounded-3 border">No dining tables found for this outlet.</div>
          ) : (
            <div className="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-3">
              {tables.map((tbl) => (
                <div key={tbl.id} className="col">
                  <div
                    className={`card h-100 border shadow-sm rounded-3 transition-all ${
                      tbl.status === 'ordered'
                        ? 'border-warning bg-warning-subtle'
                        : tbl.status === 'billed'
                        ? 'border-primary bg-primary-subtle'
                        : tbl.status === 'dirty'
                        ? 'border-danger bg-danger-subtle'
                        : 'border-light-subtle bg-white'
                    }`}
                  >
                    <div className="card-body d-flex flex-column justify-content-between p-3">
                      <div>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <h5 className="fw-bold mb-0 text-dark">{tbl.tableNumber}</h5>
                          {getTableStatusBadge(tbl.status)}
                        </div>
                        <div className="text-muted small d-flex align-items-center gap-1 mb-2">
                          <i className="bi bi-people" />
                          <span>Capacity: {tbl.capacity} covers</span>
                        </div>
                        {tbl.currentOrderId && (
                          <div className="small font-monospace text-primary bg-white px-2 py-1 rounded border mb-2">
                            Active Order: {tbl.currentOrderId.slice(0, 8)}...
                          </div>
                        )}
                      </div>

                      <div className="d-flex gap-2 mt-3">
                        {tbl.status === 'dirty' ? (
                          <button
                            className="btn btn-sm btn-danger w-100 fw-semibold d-flex align-items-center justify-content-center gap-1"
                            onClick={() => cleanTableMutation.mutate(tbl.id)}
                            disabled={cleanTableMutation.isPending}
                          >
                            <i className="bi bi-stars" />
                            <span>Mark Clean</span>
                          </button>
                        ) : (
                          <button
                            className={`btn btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-1 ${
                              tbl.status === 'free' ? 'btn-outline-primary' : 'btn-primary'
                            }`}
                            onClick={() => handleOpenTable(tbl)}
                          >
                            <i className="bi bi-arrow-right-circle" />
                            <span>{tbl.status === 'free' ? 'Open Order' : 'View Order'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================== */}
      {/* VIEW 2: TOUCH POS ORDER SCREEN (REQ-FNB-004) */}
      {/* ========================================================================== */}
      {activeTab === 'order' && (
        <div className="row g-3">
          {/* Left Column: Menu Items & Categories */}
          <div className="col-lg-8">
            <div className="bg-white p-3 rounded-3 shadow-sm border mb-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div className="d-flex align-items-center gap-2">
                <span className="fw-bold text-dark">Table:</span>
                <span className="badge bg-primary fs-6">{selectedTable ? selectedTable.tableNumber : 'No Table Selected'}</span>
                {selectedTable && (
                  <span className="text-muted small ms-2">
                    (Max {selectedTable.capacity} covers)
                  </span>
                )}
              </div>

              <div className="d-flex align-items-center gap-2">
                <span className="small text-muted">Covers:</span>
                <div className="btn-group btn-group-sm">
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setOrderCovers(Math.max(1, orderCovers - 1))}
                  >
                    -
                  </button>
                  <span className="btn btn-light disabled px-3 fw-bold">{orderCovers}</span>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setOrderCovers(orderCovers + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="d-flex gap-2 overflow-auto pb-2 mb-3">
              <button
                type="button"
                className={`btn btn-sm px-3 rounded-pill fw-semibold ${selectedCategory === 'all' ? 'btn-primary' : 'btn-outline-secondary bg-white'}`}
                onClick={() => setSelectedCategory('all')}
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`btn btn-sm px-3 rounded-pill fw-semibold ${selectedCategory === c.id ? 'btn-primary' : 'btn-outline-secondary bg-white'}`}
                  onClick={() => setSelectedCategory(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="row row-cols-2 row-cols-sm-3 row-cols-md-4 g-2">
              {menuItems
                .filter((item) => selectedCategory === 'all' || item.categoryId === selectedCategory)
                .map((item) => (
                  <div key={item.id} className="col">
                    <div
                      className={`card h-100 border rounded-3 p-2 d-flex flex-column justify-content-between text-start cursor-pointer shadow-sm ${
                        item.isAvailable ? 'hover-shadow bg-white' : 'bg-light opacity-50'
                      }`}
                      style={{ cursor: item.isAvailable ? 'pointer' : 'not-allowed' }}
                      onClick={() => item.isAvailable && handleAddToCart(item)}
                    >
                      <div>
                        <div className="d-flex justify-content-between align-items-start mb-1">
                          <span className="badge bg-light text-muted border text-truncate" style={{ maxWidth: '80px' }}>
                            {item.stationCode || 'KITCHEN'}
                          </span>
                          {!item.isAvailable ? (
                            <span className="badge bg-danger">86'd</span>
                          ) : (
                            <span className="fw-bold text-primary">${item.basePrice.toFixed(2)}</span>
                          )}
                        </div>
                        <h6 className="fw-bold mb-1 text-dark text-truncate">{item.name}</h6>
                        <div className="text-muted small text-truncate">{item.categoryName}</div>
                      </div>

                      <div className="d-flex justify-content-between align-items-center mt-2 pt-1 border-top">
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 text-muted"
                          title="Toggle 86 status"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle86Mutation.mutate({ itemId: item.id, isAvailable: !item.isAvailable });
                          }}
                        >
                          <i className={`bi bi-${item.isAvailable ? 'eye-slash' : 'eye'}`} />
                        </button>
                        {item.isAvailable && (
                          <span className="btn btn-sm btn-primary py-0 px-2 rounded-pill font-monospace">+</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Right Column: Order Ticket / Cart Summary */}
          <div className="col-lg-4">
            <div className="bg-white p-3 rounded-3 shadow-sm border d-flex flex-column h-100">
              <div className="d-flex justify-content-between align-items-center pb-2 border-bottom mb-2">
                <h6 className="fw-bold mb-0 text-dark">
                  {activeOrder ? `Order: ${activeOrder.orderNo}` : 'New Ticket'}
                </h6>
                {activeOrder && (
                  <span className={`badge ${activeOrder.status === 'fired' ? 'bg-warning text-dark' : 'bg-info'}`}>
                    {activeOrder.status.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Seat & Course Selector Controls */}
              <div className="row g-2 mb-3 bg-light p-2 rounded">
                <div className="col-6">
                  <label className="form-label small text-muted mb-1">Seat Tag</label>
                  <select
                    className="form-select form-select-sm"
                    value={currentSeat}
                    onChange={(e) => setCurrentSeat(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        Seat {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label small text-muted mb-1">Course</label>
                  <select
                    className="form-select form-select-sm"
                    value={currentCourse}
                    onChange={(e) => setCurrentCourse(e.target.value as any)}
                  >
                    <option value="drinks">Drinks</option>
                    <option value="appetizer">Appetizer</option>
                    <option value="main">Main Course</option>
                    <option value="dessert">Dessert</option>
                  </select>
                </div>
              </div>

              {/* Lines list */}
              <div className="flex-grow-1 overflow-auto pe-1 mb-3" style={{ maxHeight: '350px' }}>
                {/* Active Order Existing Lines */}
                {activeOrder?.lines && activeOrder.lines.length > 0 && (
                  <div className="mb-2">
                    <span className="text-muted fw-bold text-uppercase" style={{ fontSize: '0.7rem' }}>
                      Sent to Kitchen
                    </span>
                    {activeOrder.lines.map((l) => (
                      <div key={l.id} className="p-2 border-bottom d-flex justify-content-between align-items-center">
                        <div>
                          <div className="fw-semibold small text-dark">
                            {l.quantity}x {l.menuItemName}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            Seat {l.seatNo} • {l.course.toUpperCase()} • {l.status}
                          </div>
                        </div>
                        <div className="text-end">
                          <span className="fw-bold small text-dark">${l.lineTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Newly Added Pending Cart Items */}
                {cartItems.length > 0 && (
                  <div>
                    <span className="text-primary fw-bold text-uppercase" style={{ fontSize: '0.7rem' }}>
                      New Items (Pending Fire)
                    </span>
                    {cartItems.map((c, idx) => (
                      <div key={idx} className="p-2 border-bottom d-flex justify-content-between align-items-center bg-primary-subtle rounded mt-1">
                        <div>
                          <div className="fw-bold small text-dark">
                            {c.quantity}x {c.menuItem.name}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            Seat {c.seatNo} • {c.course.toUpperCase()}
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-bold small text-primary">
                            ${(c.menuItem.basePrice * c.quantity).toFixed(2)}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger py-0 px-1"
                            onClick={() => setCartItems(cartItems.filter((_, i) => i !== idx))}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!activeOrder && cartItems.length === 0 && (
                  <div className="text-center text-muted small py-4">
                    Tap any menu item on the left to add to ticket.
                  </div>
                )}
              </div>

              {/* Totals & Actions */}
              <div className="border-top pt-2">
                <div className="d-flex justify-content-between small text-muted mb-1">
                  <span>Subtotal:</span>
                  <span>${((activeOrder?.subtotal || 0) + cartSubtotal).toFixed(2)}</span>
                </div>
                <div className="d-flex justify-content-between small text-muted mb-1">
                  <span>Service Charge (10%):</span>
                  <span>${((activeOrder?.serviceChargeAmount || 0) + cartServiceCharge).toFixed(2)}</span>
                </div>
                <div className="d-flex justify-content-between small text-muted mb-2">
                  <span>Tax (12%):</span>
                  <span>${((activeOrder?.taxAmount || 0) + cartTax).toFixed(2)}</span>
                </div>
                <div className="d-flex justify-content-between fw-bold fs-5 text-dark mb-3">
                  <span>Total Due:</span>
                  <span>${((activeOrder?.totalAmount || 0) + cartGrandTotal).toFixed(2)}</span>
                </div>

                <div className="d-flex flex-column gap-2">
                  {cartItems.length > 0 && !activeOrder && (
                    <button
                      className="btn btn-primary fw-bold py-2 w-100"
                      onClick={() => createOrderMutation.mutate()}
                      disabled={createOrderMutation.isPending || !selectedTable}
                    >
                      <i className="bi bi-save me-1" />
                      Create Order on Table {selectedTable?.tableNumber || ''}
                    </button>
                  )}

                  {activeOrder && activeOrder.status === 'open' && (
                    <button
                      className="btn btn-warning text-dark fw-bold py-2 w-100"
                      onClick={() => fireOrderMutation.mutate(activeOrder.id)}
                      disabled={fireOrderMutation.isPending}
                    >
                      <i className="bi bi-fire me-1" />
                      Fire to Kitchen (KDS)
                    </button>
                  )}

                  {activeOrder && ['open', 'fired'].includes(activeOrder.status) && (
                    <button
                      className="btn btn-success fw-bold py-2 w-100"
                      onClick={() => createBillMutation.mutate(activeOrder.id)}
                      disabled={createBillMutation.isPending}
                    >
                      <i className="bi bi-credit-card me-1" />
                      Proceed to Bill Settlement
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================== */}
      {/* VIEW 3: KITCHEN DISPLAY SYSTEM (KDS) (REQ-FNB-004) */}
      {/* ========================================================================== */}
      {activeTab === 'kds' && (
        <div className="d-flex flex-column gap-3">
          {/* Station Filter Pills */}
          <div className="bg-white p-3 rounded-3 shadow-sm border d-flex gap-2">
            <button
              className={`btn btn-sm rounded-pill fw-semibold ${activeKdsStation === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setActiveKdsStation('all')}
            >
              All Kitchen Stations
            </button>
            {stations.map((s) => (
              <button
                key={s.id}
                className={`btn btn-sm rounded-pill fw-semibold ${activeKdsStation === s.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setActiveKdsStation(s.id)}
              >
                {s.name} ({s.code})
              </button>
            ))}
          </div>

          {/* KOT Cards Grid */}
          <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
            {kots
              .filter((k) => activeKdsStation === 'all' || k.stationId === activeKdsStation)
              .map((kot) => (
                <div key={kot.id} className="col">
                  <div
                    className={`card h-100 border shadow-sm rounded-3 ${
                      kot.isVoid
                        ? 'border-danger bg-danger-subtle'
                        : kot.status === 'cooking'
                        ? 'border-warning bg-warning-subtle'
                        : kot.status === 'ready'
                        ? 'border-success bg-success-subtle'
                        : 'border-light-subtle bg-white'
                    }`}
                  >
                    <div className="card-header bg-transparent py-2 d-flex justify-content-between align-items-center">
                      <div>
                        <span className="fw-bold small">{kot.kotNo}</span>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                          Table: {kot.tableNumber || 'Takeout'} • Station: {kot.stationName || 'GRILL'}
                        </div>
                      </div>
                      <span className={`badge ${kot.status === 'ready' ? 'bg-success' : kot.status === 'cooking' ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                        {kot.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="card-body p-3">
                      <div className="d-flex flex-column gap-2 mb-3">
                        {kot.lines.map((line) => (
                          <div key={line.id} className="d-flex justify-content-between align-items-center border-bottom pb-1">
                            <span className="fw-bold small text-dark">
                              {line.quantity}x {line.menuItemName || 'Item'}
                            </span>
                            {line.notes && <span className="badge bg-light text-dark border">{line.notes}</span>}
                          </div>
                        ))}
                      </div>

                      {/* Stepper Buttons */}
                      <div className="d-flex gap-2">
                        {kot.status === 'pending' && (
                          <button
                            className="btn btn-sm btn-warning w-100 fw-semibold"
                            onClick={() => updateKotStatusMutation.mutate({ kotId: kot.id, status: 'cooking' })}
                          >
                            Start Cooking
                          </button>
                        )}
                        {kot.status === 'cooking' && (
                          <button
                            className="btn btn-sm btn-success w-100 fw-semibold"
                            onClick={() => updateKotStatusMutation.mutate({ kotId: kot.id, status: 'ready' })}
                          >
                            Mark Ready
                          </button>
                        )}
                        {kot.status === 'ready' && (
                          <button
                            className="btn btn-sm btn-outline-secondary w-100 fw-semibold"
                            onClick={() => updateKotStatusMutation.mutate({ kotId: kot.id, status: 'collected' })}
                          >
                            Collected / Served
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ========================================================================== */}
      {/* VIEW 4: BILLS & CHECKS HISTORY (REQ-FNB-006) */}
      {/* ========================================================================== */}
      {activeTab === 'bills' && (
        <div className="card border-0 shadow-sm rounded-3">
          <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
            <span className="fw-bold text-dark">Guest Checks & Settled Bills</span>
            <span className="badge bg-light text-dark border">{bills.length} Bills</span>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small text-muted">Bill No</th>
                  <th className="small text-muted">Table</th>
                  <th className="small text-muted">Subtotal</th>
                  <th className="small text-muted">Tax / SC</th>
                  <th className="small text-muted">Tip</th>
                  <th className="small text-muted">Grand Total</th>
                  <th className="small text-muted">Status</th>
                  <th className="small text-muted">Vouchers</th>
                  <th className="small text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="fw-bold font-monospace small">{b.billNo}</td>
                    <td className="small">{b.tableNumber || '—'}</td>
                    <td className="small">${b.subtotal.toFixed(2)}</td>
                    <td className="small text-muted">
                      ${(b.taxAmount + b.serviceChargeAmount).toFixed(2)}
                    </td>
                    <td className="small text-muted">${b.tipAmount.toFixed(2)}</td>
                    <td className="fw-bold small text-dark">${b.totalAmount.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${b.status === 'paid' ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-warning-subtle text-warning-emphasis'}`}>
                        {b.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {b.revenueVoucherId ? (
                        <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle font-monospace">
                          REV: {b.revenueVoucherId.slice(0, 6)}
                        </span>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td>
                      {b.status === 'open' && (
                        <button
                          className="btn btn-sm btn-primary py-0 px-2 fw-semibold"
                          onClick={() => {
                            setActiveBill(b);
                            setIsSettlementModalOpen(true);
                          }}
                        >
                          Settle
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================== */}
      {/* VIEW 5: SHIFT CASH MANAGEMENT (REQ-FNB-010) */}
      {/* ========================================================================== */}
      {activeTab === 'shifts' && (
        <div className="row g-3">
          <div className="col-md-5">
            <div className="card border-0 shadow-sm rounded-3 p-3">
              <h6 className="fw-bold text-dark border-bottom pb-2">Active Shift Summary</h6>
              {currentShift ? (
                <div className="d-flex flex-column gap-3">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-muted small">Shift No:</span>
                    <span className="fw-bold font-monospace">{currentShift.shiftNo}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-muted small">Cashier:</span>
                    <span className="fw-semibold">{currentShift.userName || 'Current User'}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-muted small">Opened At:</span>
                    <span className="small">{new Date(currentShift.openedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center border-top pt-2">
                    <span className="text-muted small">Starting Float:</span>
                    <span className="fw-bold">${currentShift.openingFloat.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-muted small">Cash Drops to Safe:</span>
                    <span className="fw-bold text-danger">-${currentShift.cashDrops.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-muted small">Cash Collections:</span>
                    <span className="fw-bold text-success">+${currentShift.cashPayments.toFixed(2)}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center border-top pt-2 bg-light p-2 rounded">
                    <span className="fw-bold">Expected Drawer Cash:</span>
                    <span className="fw-bold text-primary fs-5">
                      ${(currentShift.openingFloat + currentShift.cashPayments - currentShift.cashDrops).toFixed(2)}
                    </span>
                  </div>

                  <div className="d-flex gap-2 pt-2">
                    <button
                      className="btn btn-outline-danger w-50 fw-semibold"
                      onClick={() => setIsCashDropModalOpen(true)}
                    >
                      <i className="bi bi-box-arrow-down me-1" />
                      Safe Drop
                    </button>
                    <button
                      className="btn btn-danger w-50 fw-semibold"
                      onClick={() => setIsCloseShiftModalOpen(true)}
                    >
                      <i className="bi bi-x-circle me-1" />
                      Close Shift
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted">
                  <p className="small mb-3">No active POS shift for this outlet.</p>
                  <button
                    className="btn btn-primary fw-semibold"
                    onClick={() => setIsOpenShiftModalOpen(true)}
                  >
                    Open Shift Float
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="col-md-7">
            <div className="card border-0 shadow-sm rounded-3 p-3">
              <h6 className="fw-bold text-dark border-bottom pb-2">Shift Reconciliation Policy</h6>
              <div className="alert alert-info py-2 small mb-3">
                <i className="bi bi-info-circle me-1" />
                Closing a shift automatically generates a balanced <strong>Cash Over/Short</strong> voucher (Account 6040 / 1010) if counted cash deviates from expected balance.
              </div>
              <p className="small text-muted">
                Each POS cashier shift is strictly tracked per outlet and user session. Intermediate safe cash drops reduce cashier exposure during peak dining hours.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================== */}
      {/* MODAL: BILL SETTLEMENT & ROOM CHARGE INTEGRATION (REQ-FNB-006, 007) */}
      {/* ========================================================================== */}
      {isSettlementModalOpen && activeBill && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg border-0 rounded-3">
              <div className="modal-header bg-white border-bottom py-3">
                <h5 className="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                  <i className="bi bi-receipt-cutoff text-primary" />
                  Settle Guest Check #{activeBill.billNo}
                </h5>
                <button type="button" className="btn-close" onClick={() => setIsSettlementModalOpen(false)} />
              </div>

              <div className="modal-body p-4">
                <div className="row g-4">
                  {/* Left: Bill Breakdown */}
                  <div className="col-md-5 border-end">
                    <h6 className="fw-bold mb-3 text-dark">Check Summary</h6>
                    <div className="d-flex justify-content-between small text-muted mb-1">
                      <span>Subtotal:</span>
                      <span>${activeBill.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="d-flex justify-content-between small text-muted mb-1">
                      <span>Service Charge (10%):</span>
                      <span>${activeBill.serviceChargeAmount.toFixed(2)}</span>
                    </div>
                    <div className="d-flex justify-content-between small text-muted mb-1">
                      <span>Tax (12%):</span>
                      <span>${activeBill.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="d-flex justify-content-between small text-muted mb-1">
                      <span>Tip Added:</span>
                      <span>${tipAmount.toFixed(2)}</span>
                    </div>
                    <div className="d-flex justify-content-between fw-bold fs-4 text-dark border-top pt-2 mt-2">
                      <span>Total:</span>
                      <span>${(activeBill.totalAmount + tipAmount).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Right: Payment Tender Selection */}
                  <div className="col-md-7">
                    <h6 className="fw-bold mb-3 text-dark">Select Payment Tender</h6>
                    <div className="btn-group w-100 mb-3" role="group">
                      <button
                        type="button"
                        className={`btn btn-sm ${settleMethod === 'room_charge' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSettleMethod('room_charge')}
                      >
                        <i className="bi bi-door-closed me-1" />
                        Room Charge
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${settleMethod === 'cash' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSettleMethod('cash')}
                      >
                        <i className="bi bi-cash me-1" />
                        Cash
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${settleMethod === 'card' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSettleMethod('card')}
                      >
                        <i className="bi bi-credit-card me-1" />
                        Card
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${settleMethod === 'qr' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSettleMethod('qr')}
                      >
                        <i className="bi bi-qr-code me-1" />
                        QR Pay
                      </button>
                    </div>

                    {/* Room Charge Specific UI (REQ-FNB-007) */}
                    {settleMethod === 'room_charge' && (
                      <div className="bg-light p-3 rounded border">
                        <label className="form-label small fw-bold text-dark mb-1">
                          In-House Guest Room Search
                        </label>
                        <input
                          type="text"
                          className="form-control form-control-sm mb-2"
                          placeholder="Search room # or guest last name..."
                          value={guestSearchQuery}
                          onChange={(e) => setGuestSearchQuery(e.target.value)}
                        />

                        <div className="overflow-auto border rounded bg-white" style={{ maxHeight: '140px' }}>
                          {inHouseGuests.length === 0 ? (
                            <div className="text-muted small p-2 text-center">
                              No matching in-house guests found.
                            </div>
                          ) : (
                            inHouseGuests.map((g) => (
                              <div
                                key={g.stayId}
                                className={`p-2 border-bottom small d-flex justify-content-between align-items-center cursor-pointer ${
                                  selectedGuestFolio?.stayId === g.stayId ? 'bg-primary-subtle text-primary fw-bold' : ''
                                }`}
                                onClick={() => setSelectedGuestFolio(g)}
                                style={{ cursor: 'pointer' }}
                              >
                                <div>
                                  <span className="badge bg-secondary me-2">Room {g.unitNumber}</span>
                                  <span>{g.guestName}</span>
                                </div>
                                <span className="font-monospace text-muted" style={{ fontSize: '0.7rem' }}>
                                  Folio Active
                                </span>
                              </div>
                            ))
                          )}
                        </div>

                        {selectedGuestFolio && (
                          <div className="alert alert-success py-1 px-2 mt-2 mb-0 small">
                            Selected: Room {selectedGuestFolio.unitNumber} ({selectedGuestFolio.guestName})
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cash Tender UI */}
                    {settleMethod === 'cash' && (
                      <div className="bg-light p-3 rounded border">
                        <label className="form-label small fw-bold text-dark mb-1">Cash Tendered ($)</label>
                        <input
                          type="number"
                          className="form-control form-control-sm mb-2"
                          value={cashTendered || ''}
                          onChange={(e) => setCashTendered(Number(e.target.value))}
                          placeholder="Amount handed by guest"
                        />
                        {cashTendered >= activeBill.totalAmount && (
                          <div className="alert alert-success py-1 px-2 mb-0 small">
                            Change Due: ${(cashTendered - activeBill.totalAmount).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer bg-light border-top py-2 d-flex justify-content-between">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setIsSettlementModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-success fw-bold px-4"
                  onClick={() => settleBillMutation.mutate()}
                  disabled={settleBillMutation.isPending || (settleMethod === 'room_charge' && !selectedGuestFolio)}
                >
                  {settleBillMutation.isPending ? 'Processing Atomic Settlement...' : 'Complete Settlement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: OPEN SHIFT */}
      {isOpenShiftModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow border-0 rounded-3">
              <div className="modal-header py-2 border-bottom">
                <h6 className="modal-title fw-bold">Open POS Shift Float</h6>
                <button type="button" className="btn-close" onClick={() => setIsOpenShiftModalOpen(false)} />
              </div>
              <div className="modal-body p-3">
                <label className="form-label small fw-bold">Starting Float Amount ($)</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={openingFloatInput}
                  onChange={(e) => setOpeningFloatInput(Number(e.target.value))}
                />
              </div>
              <div className="modal-footer py-2 border-top">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsOpenShiftModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm btn-primary fw-semibold"
                  onClick={() => openShiftMutation.mutate(openingFloatInput)}
                  disabled={openShiftMutation.isPending}
                >
                  Confirm Open Shift
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CASH DROP */}
      {isCashDropModalOpen && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow border-0 rounded-3">
              <div className="modal-header py-2 border-bottom">
                <h6 className="modal-title fw-bold">Record Safe Cash Drop</h6>
                <button type="button" className="btn-close" onClick={() => setIsCashDropModalOpen(false)} />
              </div>
              <div className="modal-body p-3">
                <div className="mb-2">
                  <label className="form-label small fw-bold">Drop Amount ($)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={cashDropAmount}
                    onChange={(e) => setCashDropAmount(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="form-label small fw-bold">Reason / Note</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={cashDropReason}
                    onChange={(e) => setCashDropReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer py-2 border-top">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsCashDropModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm btn-danger fw-semibold"
                  onClick={() => cashDropMutation.mutate()}
                  disabled={cashDropMutation.isPending}
                >
                  Record Drop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CLOSE SHIFT */}
      {isCloseShiftModalOpen && currentShift && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow border-0 rounded-3">
              <div className="modal-header py-2 border-bottom">
                <h6 className="modal-title fw-bold">Close POS Shift #{currentShift.shiftNo}</h6>
                <button type="button" className="btn-close" onClick={() => setIsCloseShiftModalOpen(false)} />
              </div>
              <div className="modal-body p-3">
                <div className="bg-light p-2 rounded mb-3 small">
                  <div>Float: ${currentShift.openingFloat.toFixed(2)}</div>
                  <div>Drops: -${currentShift.cashDrops.toFixed(2)}</div>
                  <div>Payments: +${currentShift.cashPayments.toFixed(2)}</div>
                  <div className="fw-bold mt-1 text-primary">
                    Expected: ${(currentShift.openingFloat + currentShift.cashPayments - currentShift.cashDrops).toFixed(2)}
                  </div>
                </div>

                <label className="form-label small fw-bold">Counted Closing Cash ($)</label>
                <input
                  type="number"
                  className="form-control form-control-sm mb-2"
                  value={closingCashInput}
                  onChange={(e) => setClosingCashInput(Number(e.target.value))}
                />

                {(() => {
                  const exp = currentShift.openingFloat + currentShift.cashPayments - currentShift.cashDrops;
                  const diff = closingCashInput - exp;
                  return (
                    <div className={`alert ${diff === 0 ? 'alert-success' : diff > 0 ? 'alert-warning' : 'alert-danger'} py-1 px-2 small mb-0`}>
                      Variance: {diff === 0 ? 'Balanced ($0.00)' : diff > 0 ? `Over (+$${diff.toFixed(2)})` : `Short (-$${Math.abs(diff).toFixed(2)})`}
                    </div>
                  );
                })()}
              </div>
              <div className="modal-footer py-2 border-top">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setIsCloseShiftModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm btn-danger fw-semibold"
                  onClick={() => closeShiftMutation.mutate()}
                  disabled={closeShiftMutation.isPending}
                >
                  Close & Post Over/Short Voucher
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
