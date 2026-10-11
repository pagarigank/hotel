import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '../stores/useAppStore';
export const ManagerOverrideModal = ({ isOpen, onClose }) => {
    const { activeTenantId } = useAppStore();
    const [managerEmail, setManagerEmail] = useState('admin@acme.com');
    const [managerPin, setManagerPin] = useState('1234');
    const [action, setAction] = useState('apply_folio_discount');
    const [discountPct, setDiscountPct] = useState(25);
    const [reason, setReason] = useState('VIP guest complaint regarding delayed room inspection');
    const [overrideResult, setOverrideResult] = useState(null);
    const overrideMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/v1/auth/manager-override', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': activeTenantId,
                },
                body: JSON.stringify({
                    managerEmail,
                    managerPin,
                    action,
                    discountPct: Number(discountPct),
                    reason,
                }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || errorData.title || 'Manager override failed');
            }
            return res.json();
        },
        onSuccess: (data) => {
            setOverrideResult(data);
        },
    });
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "modal show d-block", style: { backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }, tabIndex: -1, children: _jsx("div", { className: "modal-dialog modal-dialog-centered", children: _jsxs("div", { className: "modal-content shadow-lg border-0 rounded-3", children: [_jsxs("div", { className: "modal-header border-bottom bg-light px-4 py-3", children: [_jsxs("div", { className: "d-flex align-items-center gap-2", children: [_jsx("div", { className: "rounded-circle bg-warning-subtle text-warning d-flex align-items-center justify-content-center", style: { width: '36px', height: '36px' }, children: _jsx("i", { className: "bi bi-shield-lock-fill fs-5" }) }), _jsxs("div", { children: [_jsx("h6", { className: "modal-title fw-bold mb-0", children: "Manager Override Authorization" }), _jsx("span", { className: "text-muted", style: { fontSize: '0.78rem' }, children: "Sensitive operational limit bypass with mandatory audit logging" })] })] }), _jsx("button", { type: "button", className: "btn-close", onClick: onClose })] }), _jsx("div", { className: "modal-body px-4 py-3", children: overrideResult ? (_jsxs("div", { className: "alert alert-success border-success-subtle p-3 mb-0", children: [_jsxs("div", { className: "d-flex align-items-center gap-2 mb-2", children: [_jsx("i", { className: "bi bi-check-circle-fill text-success fs-5" }), _jsxs("span", { className: "fw-bold", children: ["Override Approved by ", overrideResult.managerName] })] }), _jsx("p", { className: "small mb-2 text-dark", children: "High-priority audit log registered with transaction signature. Valid for 5 minutes." }), _jsxs("div", { className: "p-2 bg-white rounded border font-monospace text-break", style: { fontSize: '0.75rem' }, children: [_jsx("span", { className: "fw-bold text-muted", children: "Token:" }), " ", overrideResult.overrideToken] }), _jsx("div", { className: "mt-3 text-end", children: _jsx("button", { type: "button", className: "btn btn-sm btn-primary", onClick: () => {
                                            setOverrideResult(null);
                                            onClose();
                                        }, children: "Done" }) })] })) : (_jsxs("form", { onSubmit: (e) => {
                                e.preventDefault();
                                overrideMutation.mutate();
                            }, children: [overrideMutation.isError && (_jsxs("div", { className: "alert alert-danger py-2 px-3 small mb-3", children: [_jsx("i", { className: "bi bi-exclamation-triangle-fill me-2" }), overrideMutation.error.message] })), _jsxs("div", { className: "mb-3", children: [_jsx("label", { className: "form-label small fw-semibold text-muted", children: "Manager Email" }), _jsx("input", { type: "email", className: "form-control form-control-sm", value: managerEmail, onChange: (e) => setManagerEmail(e.target.value), required: true })] }), _jsxs("div", { className: "mb-3", children: [_jsxs("label", { className: "form-label small fw-semibold text-muted", children: ["Manager PIN ", _jsx("span", { className: "badge bg-secondary-subtle text-secondary ms-1", children: "Default: 1234" })] }), _jsx("input", { type: "password", maxLength: 8, className: "form-control form-control-sm font-monospace", value: managerPin, onChange: (e) => setManagerPin(e.target.value), required: true })] }), _jsxs("div", { className: "row g-2 mb-3", children: [_jsxs("div", { className: "col-7", children: [_jsx("label", { className: "form-label small fw-semibold text-muted", children: "Action Type" }), _jsxs("select", { className: "form-select form-select-sm", value: action, onChange: (e) => setAction(e.target.value), children: [_jsx("option", { value: "apply_folio_discount", children: "Apply Discount Exceeding Limit" }), _jsx("option", { value: "void_posted_charge", children: "Void Posted Folio Charge" }), _jsx("option", { value: "night_audit_override", children: "Night Audit Imbalance Bypass" })] })] }), _jsxs("div", { className: "col-5", children: [_jsx("label", { className: "form-label small fw-semibold text-muted", children: "Discount %" }), _jsx("input", { type: "number", min: 0, max: 100, className: "form-control form-control-sm", value: discountPct, onChange: (e) => setDiscountPct(Number(e.target.value)) })] })] }), _jsxs("div", { className: "mb-3", children: [_jsx("label", { className: "form-label small fw-semibold text-muted", children: "Mandatory Reason" }), _jsx("textarea", { rows: 2, className: "form-control form-control-sm", value: reason, onChange: (e) => setReason(e.target.value), required: true, placeholder: "Provide detailed justification for audit trail..." })] }), _jsxs("div", { className: "d-flex justify-content-end gap-2 pt-2 border-top", children: [_jsx("button", { type: "button", className: "btn btn-sm btn-outline-secondary", onClick: onClose, children: "Cancel" }), _jsxs("button", { type: "submit", className: "btn btn-sm btn-warning fw-semibold d-flex align-items-center gap-1", disabled: overrideMutation.isPending, children: [overrideMutation.isPending && (_jsx("span", { className: "spinner-border spinner-border-sm me-1", role: "status" })), "Authorize Override"] })] })] })) })] }) }) }));
};
