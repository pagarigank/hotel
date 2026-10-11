import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
export const Sidebar = ({ currentTab, onSelectTab }) => {
    const { activeTenantId, activeBranchId } = useAppStore();
    const { data: navData, isLoading } = useQuery({
        queryKey: ['ui-navigation', activeTenantId],
        queryFn: async () => {
            const res = await fetch('/api/v1/ui/navigation', {
                headers: {
                    'X-Tenant-Id': activeTenantId,
                    'X-Branch-Id': activeBranchId,
                },
            });
            if (!res.ok)
                throw new Error('Failed to load navigation');
            return res.json();
        },
    });
    return (_jsxs("aside", { className: "d-flex flex-column bg-white border-end py-3 px-2", style: { width: '250px', minHeight: 'calc(100vh - 60px)', flexShrink: 0 }, children: [_jsx("div", { className: "px-3 pb-2 text-uppercase text-muted fw-bold", style: { fontSize: '0.7rem', letterSpacing: '0.05em' }, children: "Navigation" }), _jsxs("nav", { className: "d-flex flex-column gap-1", children: [_jsxs("button", { type: "button", className: `btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${currentTab === 'settings' ? 'bg-primary text-white shadow-sm' : 'text-dark hover-bg-light'}`, onClick: () => onSelectTab('settings'), children: [_jsx("i", { className: `bi bi-gear-wide-connected fs-6 ${currentTab === 'settings' ? 'text-white' : 'text-primary'}` }), _jsx("span", { children: "Settings & Config Engine" })] }), _jsxs("button", { type: "button", className: `btn text-start d-flex align-items-center gap-2 px-3 py-2 rounded-2 fw-semibold border-0 ${currentTab === 'records' ? 'bg-primary text-white shadow-sm' : 'text-dark hover-bg-light'}`, onClick: () => onSelectTab('records'), children: [_jsx("i", { className: `bi bi-database-check fs-6 ${currentTab === 'records' ? 'text-white' : 'text-muted'}` }), _jsx("span", { children: "Tenant Data Isolation" })] }), _jsx("div", { className: "my-2 border-top" }), isLoading ? (_jsx("div", { className: "px-3 py-2 text-muted small", children: "Loading menu tree..." })) : (navData?.items.map((section) => (_jsxs("div", { className: "mb-2", children: [_jsxs("div", { className: "px-3 py-1 text-muted fw-bold text-uppercase d-flex align-items-center gap-2", style: { fontSize: '0.68rem' }, children: [_jsx("i", { className: `bi ${section.icon} text-muted` }), _jsx("span", { children: section.label })] }), section.children?.map((child) => (_jsxs("button", { type: "button", className: "btn btn-sm text-start d-flex align-items-center justify-content-between px-3 py-1 text-secondary border-0 w-100", style: { fontSize: '0.85rem' }, onClick: () => {
                                    if (child.key === 'status_defs' || child.key === 'general_settings' || child.key === 'numbering' || child.key === 'roles_permissions') {
                                        onSelectTab('settings');
                                    }
                                }, children: [_jsxs("span", { className: "d-flex align-items-center gap-2", children: [_jsx("i", { className: `bi ${child.icon}`, style: { fontSize: '0.8rem' } }), _jsx("span", { children: child.label })] }), child.key === 'board' && (_jsx("span", { className: "badge bg-secondary-subtle text-secondary", style: { fontSize: '0.65rem' }, children: "Phase 2" }))] }, child.key)))] }, section.key))))] })] }));
};
