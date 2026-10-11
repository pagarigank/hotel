import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
export const SettingsView = () => {
    const queryClient = useQueryClient();
    const { activeTenantId, activeTenantName, activeBranchId, activeBranchName } = useAppStore();
    const [activeScope, setActiveScope] = useState('tenant');
    const [selectedStatusForActions, setSelectedStatusForActions] = useState('due_in');
    const [numberingDocType, setNumberingDocType] = useState('reservation');
    const [lastGeneratedNumber, setLastGeneratedNumber] = useState(null);
    // Settings values local state for inputs
    const [checkinRequireClean, setCheckinRequireClean] = useState('clean');
    const [overbookingPct, setOverbookingPct] = useState(5);
    const [roundingAccount, setRoundingAccount] = useState('9990-ROUNDING');
    const [managerPin, setManagerPin] = useState('1234');
    const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
    // 1. Fetch settings for current tenant
    const { data: settingsList, isLoading: settingsLoading } = useQuery({
        queryKey: ['settings', activeTenantId, activeScope, activeBranchId],
        queryFn: async () => {
            const scopeParams = activeScope === 'branch'
                ? `?scopeType=branch&scopeId=${activeBranchId}`
                : `?scopeType=tenant`;
            const res = await fetch(`/api/v1/settings${scopeParams}`, {
                headers: { 'X-Tenant-Id': activeTenantId },
            });
            if (!res.ok)
                throw new Error('Failed to load settings');
            return res.json();
        },
    });
    // 2. Fetch status definitions
    const { data: statusDefs, isLoading: statusesLoading } = useQuery({
        queryKey: ['ui-status-defs', activeTenantId, activeBranchId],
        queryFn: async () => {
            const res = await fetch(`/api/v1/ui/status-defs?entity=unit&branchId=${activeBranchId}`, {
                headers: { 'X-Tenant-Id': activeTenantId, 'X-Branch-Id': activeBranchId },
            });
            if (!res.ok)
                throw new Error('Failed to load status defs');
            return res.json();
        },
    });
    // 3. Fetch server-evaluated actions for selected status
    const { data: evaluatedActions, isLoading: actionsLoading } = useQuery({
        queryKey: ['ui-actions', activeTenantId, selectedStatusForActions, activeBranchId],
        queryFn: async () => {
            const res = await fetch(`/api/v1/ui/actions?entity=unit&status=${selectedStatusForActions}&branchId=${activeBranchId}`, {
                headers: {
                    'X-Tenant-Id': activeTenantId,
                    'X-Branch-Id': activeBranchId,
                    'X-Permissions': '*',
                },
            });
            if (!res.ok)
                throw new Error('Failed to load actions');
            return res.json();
        },
    });
    // 4. Mutation to update a setting
    const updateSettingMutation = useMutation({
        mutationFn: async ({ key, value }) => {
            const payload = {
                value,
                scopeType: activeScope,
                scopeId: activeScope === 'branch' ? activeBranchId : undefined,
            };
            const res = await fetch(`/api/v1/settings/${key}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': activeTenantId,
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok)
                throw new Error('Failed to update setting');
            return res.json();
        },
        onSuccess: (_, variables) => {
            setSaveSuccessMsg(`Saved '${variables.key}' at ${activeScope.toUpperCase()} scope!`);
            setTimeout(() => setSaveSuccessMsg(''), 4000);
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
    });
    // 5. Mutation to generate gapless number
    const numberingMutation = useMutation({
        mutationFn: async (docType) => {
            const res = await fetch('/api/v1/numbering/next', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': activeTenantId,
                },
                body: JSON.stringify({
                    branchId: activeBranchId,
                    docType,
                }),
            });
            if (!res.ok)
                throw new Error('Failed to generate number');
            return res.json();
        },
        onSuccess: (data) => {
            setLastGeneratedNumber(data);
        },
    });
    return (_jsxs("div", { className: "d-flex flex-column gap-4 p-4 max-w-7xl mx-auto", children: [_jsxs("div", { className: "d-flex justify-content-between align-items-center", children: [_jsxs("div", { children: [_jsxs("h4", { className: "fw-bold text-dark mb-1 d-flex align-items-center gap-2", children: [_jsx("i", { className: "bi bi-gear-wide-connected text-primary" }), "Configuration & Settings Engine"] }), _jsx("p", { className: "text-muted small mb-0", children: "Hierarchical settings resolution (Tenant \u25B8 Branch), live room status tokens, and server-driven action evaluations." })] }), _jsxs("div", { className: "btn-group p-1 bg-white border rounded-pill shadow-sm", role: "group", children: [_jsxs("button", { type: "button", className: `btn btn-sm rounded-pill px-3 fw-semibold ${activeScope === 'tenant' ? 'btn-primary' : 'btn-light text-muted'}`, onClick: () => setActiveScope('tenant'), children: [_jsx("i", { className: "bi bi-building me-1" }), "Tenant Scope: ", activeTenantName] }), _jsxs("button", { type: "button", className: `btn btn-sm rounded-pill px-3 fw-semibold ${activeScope === 'branch' ? 'btn-primary' : 'btn-light text-muted'}`, onClick: () => setActiveScope('branch'), children: [_jsx("i", { className: "bi bi-geo-alt me-1" }), "Branch Override: ", activeBranchName] })] })] }), saveSuccessMsg && (_jsxs("div", { className: "alert alert-success py-2 px-3 small d-flex align-items-center gap-2 mb-0 shadow-sm", children: [_jsx("i", { className: "bi bi-check-circle-fill text-success" }), _jsx("span", { children: saveSuccessMsg })] })), _jsxs("div", { className: "row g-4", children: [_jsx("div", { className: "col-lg-7", children: _jsxs("div", { className: "card shadow-sm border-0 h-100", children: [_jsxs("div", { className: "card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center", children: [_jsxs("span", { className: "fw-bold text-dark d-flex align-items-center gap-2", children: [_jsx("i", { className: "bi bi-sliders text-primary" }), "Hierarchical Parameters (", activeScope.toUpperCase(), " Scope)"] }), _jsxs("span", { className: "badge bg-primary-subtle text-primary border border-primary-subtle", children: ["Inheritance: ", activeScope === 'branch' ? 'Branch Override' : 'Tenant Default'] })] }), _jsxs("div", { className: "card-body d-flex flex-column gap-3", children: [_jsxs("div", { className: "p-3 rounded border bg-light-subtle d-flex justify-content-between align-items-center", children: [_jsxs("div", { children: [_jsx("div", { className: "fw-semibold text-dark small mb-0", children: "frontdesk.checkin.requireCleanRoom" }), _jsx("span", { className: "text-muted", style: { fontSize: '0.78rem' }, children: "Requires unit to be marked clean or inspected prior to guest check-in." })] }), _jsxs("div", { className: "d-flex align-items-center gap-2", children: [_jsxs("select", { className: "form-select form-select-sm", style: { width: '130px' }, value: checkinRequireClean, onChange: (e) => setCheckinRequireClean(e.target.value), children: [_jsx("option", { value: "clean", children: "Clean" }), _jsx("option", { value: "inspected", children: "Inspected" }), _jsx("option", { value: "none", children: "None (Allow)" })] }), _jsx("button", { type: "button", className: "btn btn-sm btn-outline-primary", onClick: () => updateSettingMutation.mutate({
                                                                key: 'frontdesk.checkin.requireCleanRoom',
                                                                value: checkinRequireClean,
                                                            }), children: "Save" })] })] }), _jsxs("div", { className: "p-3 rounded border bg-light-subtle d-flex justify-content-between align-items-center", children: [_jsxs("div", { children: [_jsx("div", { className: "fw-semibold text-dark small mb-0", children: "hotel.overbooking.allowancePct" }), _jsx("span", { className: "text-muted", style: { fontSize: '0.78rem' }, children: "Maximum permitted overbooking buffer during high season." })] }), _jsxs("div", { className: "d-flex align-items-center gap-2", children: [_jsxs("div", { className: "input-group input-group-sm", style: { width: '110px' }, children: [_jsx("input", { type: "number", className: "form-control", value: overbookingPct, onChange: (e) => setOverbookingPct(Number(e.target.value)) }), _jsx("span", { className: "input-group-text", children: "%" })] }), _jsx("button", { type: "button", className: "btn btn-sm btn-outline-primary", onClick: () => updateSettingMutation.mutate({
                                                                key: 'hotel.overbooking.allowancePct',
                                                                value: overbookingPct,
                                                            }), children: "Save" })] })] }), _jsxs("div", { className: "p-3 rounded border bg-light-subtle d-flex justify-content-between align-items-center", children: [_jsxs("div", { children: [_jsx("div", { className: "fw-semibold text-dark small mb-0", children: "security.manager_pin" }), _jsx("span", { className: "text-muted", style: { fontSize: '0.78rem' }, children: "Supervisor PIN code required for manager override modal authorizations." })] }), _jsxs("div", { className: "d-flex align-items-center gap-2", children: [_jsx("input", { type: "text", maxLength: 8, className: "form-control form-control-sm font-monospace", style: { width: '100px' }, value: managerPin, onChange: (e) => setManagerPin(e.target.value) }), _jsx("button", { type: "button", className: "btn btn-sm btn-outline-primary", onClick: () => updateSettingMutation.mutate({
                                                                key: 'security.manager_pin',
                                                                value: managerPin,
                                                            }), children: "Save" })] })] })] })] }) }), _jsx("div", { className: "col-lg-5", children: _jsxs("div", { className: "card shadow-sm border-0 h-100", children: [_jsx("div", { className: "card-header bg-white border-bottom py-3", children: _jsxs("span", { className: "fw-bold text-dark d-flex align-items-center gap-2", children: [_jsx("i", { className: "bi bi-123 text-primary" }), "Gapless Numbering Sequences Engine"] }) }), _jsxs("div", { className: "card-body d-flex flex-column justify-content-between", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-muted small mb-3", children: ["Thread-safe document numbering with row locks (", _jsx("code", { children: "FOR UPDATE" }), ") ensuring zero missing numbers for fiscal compliance."] }), _jsxs("div", { className: "mb-3", children: [_jsx("label", { className: "form-label small fw-semibold text-muted", children: "Document Type" }), _jsxs("select", { className: "form-select form-select-sm", value: numberingDocType, onChange: (e) => setNumberingDocType(e.target.value), children: [_jsx("option", { value: "reservation", children: "Reservation (RES)" }), _jsx("option", { value: "folio", children: "Guest Folio (FOL)" }), _jsx("option", { value: "invoice", children: "Official Tax Invoice (INV - Gapless)" }), _jsx("option", { value: "voucher", children: "Journal Voucher (JV - Gapless)" })] })] }), _jsxs("button", { type: "button", className: "btn btn-sm btn-primary w-100 fw-semibold d-flex align-items-center justify-content-center gap-2", onClick: () => numberingMutation.mutate(numberingDocType), disabled: numberingMutation.isPending, children: [_jsx("i", { className: "bi bi-plus-circle" }), "Generate Next Sequential Document Number"] })] }), lastGeneratedNumber && (_jsxs("div", { className: "mt-3 p-3 bg-light rounded border border-primary-subtle", children: [_jsxs("div", { className: "d-flex justify-content-between align-items-center mb-1", children: [_jsx("span", { className: "text-muted small fw-semibold", children: "Generated Number:" }), _jsx("span", { className: "badge bg-success-subtle text-success", children: lastGeneratedNumber.isGapless ? 'Fiscal Gapless' : 'Buffered' })] }), _jsx("div", { className: "fs-5 fw-bold font-monospace text-primary", children: lastGeneratedNumber.docNumber }), _jsxs("div", { className: "small text-muted", children: ["Sequence No: ", _jsx("span", { className: "fw-semibold", children: lastGeneratedNumber.sequenceNo })] })] }))] })] }) })] }), _jsxs("div", { className: "card shadow-sm border-0", children: [_jsx("div", { className: "card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center", children: _jsxs("div", { children: [_jsxs("h6", { className: "fw-bold text-dark mb-0 d-flex align-items-center gap-2", children: [_jsx("i", { className: "bi bi-palette text-primary" }), "Room Status Definitions & Contrast-Checked Color Tokens"] }), _jsx("span", { className: "text-muted", style: { fontSize: '0.78rem' }, children: "WCAG 2.2 AA compliant tokens (all badges have icons and labels; never color alone)" })] }) }), _jsx("div", { className: "card-body", children: _jsx("div", { className: "row g-3", children: statusesLoading ? (_jsx("div", { className: "col-12 text-muted small", children: "Loading status definitions..." })) : (statusDefs?.map((st) => (_jsx("div", { className: "col-md-3 col-sm-6", children: _jsxs("div", { className: "p-3 rounded-3 border d-flex flex-column gap-2", style: {
                                        backgroundColor: `var(--${st.colorToken}-bg, #f8f9fa)`,
                                        borderLeft: `5px solid var(--${st.colorToken}-accent, #0d6efd)`,
                                    }, children: [_jsxs("div", { className: "d-flex justify-content-between align-items-center", children: [_jsxs("span", { className: "fw-bold small d-flex align-items-center gap-2 text-dark", children: [_jsx("i", { className: `bi ${st.icon || 'bi-circle'} text-primary` }), st.label] }), _jsx("span", { className: "font-monospace text-muted", style: { fontSize: '0.7rem' }, children: st.code })] }), _jsxs("div", { className: "d-flex flex-wrap gap-1", style: { fontSize: '0.68rem' }, children: [st.isSellable && _jsx("span", { className: "badge bg-success-subtle text-success", children: "Sellable" }), st.isOccupied && _jsx("span", { className: "badge bg-primary-subtle text-primary", children: "Occupied" }), st.isDirty && _jsx("span", { className: "badge bg-warning-subtle text-warning", children: "Dirty" }), st.blocksBooking && _jsx("span", { className: "badge bg-danger-subtle text-danger", children: "Blocks Booking" })] })] }) }, st.id)))) }) })] }), _jsxs("div", { className: "card shadow-sm border-0", children: [_jsxs("div", { className: "card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center", children: [_jsxs("div", { children: [_jsxs("h6", { className: "fw-bold text-dark mb-0 d-flex align-items-center gap-2", children: [_jsx("i", { className: "bi bi-lightning-charge text-primary" }), "Server-Driven Action Menu Evaluator (", _jsx("code", { children: "GET /api/v1/ui/actions" }), ")"] }), _jsx("span", { className: "text-muted", style: { fontSize: '0.78rem' }, children: "Dynamic context menu resolution based on entity state-machine and RBAC permissions" })] }), _jsxs("div", { className: "d-flex align-items-center gap-2", children: [_jsx("span", { className: "small text-muted fw-semibold", children: "Unit Status:" }), _jsxs("select", { className: "form-select form-select-sm", style: { width: '160px' }, value: selectedStatusForActions, onChange: (e) => setSelectedStatusForActions(e.target.value), children: [_jsx("option", { value: "due_in", children: "Due In" }), _jsx("option", { value: "vacant_clean", children: "Vacant Clean" }), _jsx("option", { value: "vacant_dirty", children: "Vacant Dirty" }), _jsx("option", { value: "occupied", children: "Occupied" }), _jsx("option", { value: "due_out", children: "Due Out" }), _jsx("option", { value: "out_of_order", children: "Out of Order" })] })] })] }), _jsxs("div", { className: "card-body", children: [_jsxs("p", { className: "text-muted small mb-3", children: ["Active server actions evaluated for unit status ", _jsx("strong", { children: selectedStatusForActions }), ":"] }), _jsx("div", { className: "d-flex flex-wrap gap-3", children: actionsLoading ? (_jsx("div", { className: "text-muted small", children: "Evaluating permitted actions..." })) : evaluatedActions?.length === 0 ? (_jsxs("div", { className: "text-muted small", children: ["No actions enabled for status '", selectedStatusForActions, "'"] })) : (evaluatedActions?.map((act) => (_jsxs("div", { className: "card p-3 border shadow-none d-flex flex-column gap-2", style: { width: '220px', background: '#fafbfc' }, children: [_jsxs("div", { className: "d-flex align-items-center gap-2 fw-semibold text-dark", children: [_jsx("i", { className: `bi ${act.icon || 'bi-gear'} text-primary fs-5` }), _jsx("span", { children: act.label })] }), _jsxs("div", { className: "d-flex justify-content-between align-items-center pt-2 border-top", children: [_jsxs("span", { className: "badge bg-secondary-subtle text-secondary", style: { fontSize: '0.65rem' }, children: ["Target: ", act.target?.type || 'modal'] }), _jsx("span", { className: "badge bg-light text-muted border", style: { fontSize: '0.65rem' }, children: act.permission })] })] }, act.id)))) })] })] })] }));
};
