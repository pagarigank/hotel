import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from './stores/useAppStore';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { SettingsView } from './components/SettingsView';
import { ManagerOverrideModal } from './components/ManagerOverrideModal';
export function App() {
    const queryClient = useQueryClient();
    const { activeTenantId, activeTenantName, activeBranchId, activeBranchName, businessDate, } = useAppStore();
    const [currentTab, setCurrentTab] = useState('settings');
    const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    // 1. Fetch Health Status
    const { data: health } = useQuery({
        queryKey: ['health'],
        queryFn: async () => {
            const res = await fetch('/health/ready');
            if (!res.ok)
                throw new Error('Health check failed');
            return res.json();
        },
        refetchInterval: 10000,
    });
    // 2. Fetch Tenant-Scoped Records
    const { data: records, isLoading: recordsLoading, error: recordsError, } = useQuery({
        queryKey: ['test-records', activeTenantId],
        queryFn: async () => {
            const res = await fetch('/api/v1/test-records', {
                headers: {
                    'X-Tenant-Id': activeTenantId,
                    'X-Branch-Id': activeBranchId,
                },
            });
            if (!res.ok)
                throw new Error(`Failed to load records: ${res.statusText}`);
            return res.json();
        },
    });
    // 3. Mutation to create record
    const createMutation = useMutation({
        mutationFn: async ({ title, content }) => {
            const idempotencyKey = crypto.randomUUID();
            const res = await fetch('/api/v1/test-records', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': activeTenantId,
                    'X-Branch-Id': activeBranchId,
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({ title, content, branchId: activeBranchId }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || 'Creation failed');
            }
            return res.json();
        },
        onSuccess: () => {
            setNewTitle('');
            setNewContent('');
            queryClient.invalidateQueries({ queryKey: ['test-records', activeTenantId] });
        },
    });
    const handleCreate = (e) => {
        e.preventDefault();
        if (!newTitle.trim())
            return;
        createMutation.mutate({ title: newTitle, content: newContent });
    };
    return (_jsxs("div", { className: "app-shell d-flex flex-column bg-light", style: { minHeight: '100vh' }, children: [_jsx(TopBar, { onOpenOverride: () => setIsOverrideModalOpen(true) }), _jsxs("div", { className: "d-flex flex-grow-1", children: [_jsx(Sidebar, { currentTab: currentTab, onSelectTab: (t) => setCurrentTab(t) }), _jsx("main", { className: "flex-grow-1 overflow-auto", style: { minHeight: 'calc(100vh - 60px)' }, children: currentTab === 'settings' ? (_jsx(SettingsView, {})) : (_jsxs("div", { className: "p-4 max-w-7xl mx-auto d-flex flex-column gap-4", children: [_jsxs("div", { className: "p-3 bg-white rounded-3 shadow-sm border d-flex justify-content-between align-items-center", children: [_jsxs("div", { className: "d-flex align-items-center gap-3", children: [_jsx("div", { className: "rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center", style: { width: '40px', height: '40px' }, children: _jsx("i", { className: "bi bi-shield-shaded fs-5" }) }), _jsxs("div", { children: [_jsx("h6", { className: "fw-bold mb-0 text-dark", children: "Tenant Isolation & RLS Boundary Active" }), _jsxs("span", { className: "text-muted small", children: ["Querying database as role ", _jsx("code", { children: health?.database.user || 'innkeeper_app' }), " (NOBYPASSRLS enforced)"] })] })] }), _jsxs("div", { className: "badge bg-success-subtle text-success border border-success-subtle px-3 py-2 d-flex align-items-center gap-1", children: [_jsx("i", { className: "bi bi-check2-circle" }), _jsx("span", { children: "RLS Isolation Active" })] })] }), _jsxs("div", { className: "card shadow-sm border-0", children: [_jsxs("div", { className: "card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center", children: [_jsxs("span", { className: "fw-bold text-dark d-flex align-items-center gap-2", children: [_jsx("i", { className: "bi bi-folder text-primary" }), "Isolated Tenant Records for ", activeTenantName] }), _jsxs("span", { className: "badge bg-light text-dark border", children: [records?.length || 0, " Records"] })] }), _jsxs("div", { className: "card-body", children: [_jsxs("form", { onSubmit: handleCreate, className: "row g-2 mb-4", children: [_jsx("div", { className: "col-md-5", children: _jsx("input", { type: "text", className: "form-control form-control-sm", placeholder: "Record Title (e.g. VIP Booking Note)", value: newTitle, onChange: (e) => setNewTitle(e.target.value), required: true }) }), _jsx("div", { className: "col-md-5", children: _jsx("input", { type: "text", className: "form-control form-control-sm", placeholder: "Content details...", value: newContent, onChange: (e) => setNewContent(e.target.value) }) }), _jsx("div", { className: "col-md-2", children: _jsx("button", { type: "submit", className: "btn btn-sm btn-primary w-100 fw-semibold", disabled: createMutation.isPending, children: createMutation.isPending ? 'Saving...' : 'Add Record' }) })] }), recordsLoading ? (_jsx("div", { className: "text-muted small", children: "Loading records..." })) : recordsError ? (_jsx("div", { className: "alert alert-danger py-2 small", children: recordsError.message })) : records?.length === 0 ? (_jsxs("div", { className: "text-muted small py-3 text-center", children: ["No records found for ", activeTenantName, ". Records created here cannot leak to other tenants."] })) : (_jsx("div", { className: "table-responsive", children: _jsxs("table", { className: "table table-sm table-hover align-middle mb-0", children: [_jsx("thead", { className: "table-light", children: _jsxs("tr", { children: [_jsx("th", { className: "small text-muted", children: "ID" }), _jsx("th", { className: "small text-muted", children: "Title" }), _jsx("th", { className: "small text-muted", children: "Content" }), _jsx("th", { className: "small text-muted", children: "Tenant ID" }), _jsx("th", { className: "small text-muted", children: "Created At" })] }) }), _jsx("tbody", { children: records?.map((r) => (_jsxs("tr", { children: [_jsxs("td", { className: "font-monospace small text-muted", children: [r.id.slice(0, 8), "..."] }), _jsx("td", { className: "fw-semibold small", children: r.title }), _jsx("td", { className: "small text-muted", children: r.content || '—' }), _jsxs("td", { className: "font-monospace small text-muted", children: [r.tenantId.slice(0, 8), "..."] }), _jsx("td", { className: "small text-muted", children: new Date(r.createdAt).toLocaleString() })] }, r.id))) })] }) }))] })] })] })) })] }), _jsx(ManagerOverrideModal, { isOpen: isOverrideModalOpen, onClose: () => setIsOverrideModalOpen(false) })] }));
}
export default App;
