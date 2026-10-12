import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { ensureCsrfToken } from '../lib/http';

export const LoginPage: React.FC = () => {
  const { status, error, login } = useAuthStore();
  const [email, setEmail] = useState('admin@acme.com');
  const [password, setPassword] = useState('Password123!');
  const [busy, setBusy] = useState(false);
  const [showCreds, setShowCreds] = useState(false);

  useEffect(() => {
    ensureCsrfToken().catch(() => {
      // CSRF will be re-fetched on submit if the first attempt fails.
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch {
      // Error is surfaced via `error` from the store.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center bg-light"
      style={{ minHeight: '100vh' }}
    >
      <div className="card shadow-sm border-0 rounded-3" style={{ width: '420px' }}>
        <div className="card-body p-4 p-md-5">
          <div className="d-flex align-items-center gap-2 mb-1">
            <div
              className="rounded-3 d-flex align-items-center justify-content-center text-white font-monospace fw-bold"
              style={{
                width: '40px',
                height: '40px',
                background: 'var(--brand)',
                fontSize: '1.2rem',
              }}
            >
              I
            </div>
            <span className="brand-badge fs-3 fw-bold text-dark">Innkeeper</span>
          </div>
          <p className="text-muted mb-4" style={{ fontSize: '0.9rem' }}>
            Multi-tenant hotel operations management
          </p>

          <h1 className="h5 fw-bold text-dark mb-3 d-flex align-items-center gap-2">
            <i className="bi bi-shield-lock-fill text-primary" />
            Sign in to continue
          </h1>

          {error && status !== 'authenticated' && (
            <div className="alert alert-danger py-2 px-3 small mb-3">
              <i className="bi bi-exclamation-triangle-fill me-2" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
            <div>
              <label className="form-label small fw-semibold text-muted">Email</label>
              <input
                type="email"
                className="form-control"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@hotel.com"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="form-label small fw-semibold text-muted">Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 fw-semibold py-2"
              disabled={busy}
            >
              {busy ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Signing in...
                </>
              ) : (
                <>
                  <i className="bi bi-box-arrow-in-right me-2" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-4 pt-3 border-top">
            <button
              type="button"
              className="btn btn-link btn-sm p-0 text-muted"
              onClick={() => setShowCreds((v) => !v)}
              style={{ textDecoration: 'none', fontSize: '0.78rem' }}
            >
              <i className="bi bi-info-circle me-1" />
              Demo credentials
            </button>
            {showCreds && (
              <div className="mt-2 p-2 bg-light rounded border text-start small text-muted">
                <div className="fw-semibold text-dark mb-1">Tenant A</div>
                <div className="font-monospace">admin@acme.com</div>
                <div className="font-monospace">Password123!</div>
                <div className="fw-semibold text-dark mt-2 mb-1">Tenant B</div>
                <div className="font-monospace">manager@boracay.com</div>
                <div className="font-monospace mb-1">Password123!</div>
                <div className="text-muted mt-1">Manager override PIN: 1234</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default LoginPage;
