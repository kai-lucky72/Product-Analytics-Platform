import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth-context';
import { Button } from '../components/ui';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ email, password, name, organizationName: organization || undefined });
      }
    } catch (err: any) {
      setError(err?.message ?? 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark large">N</span>
          <h1>Nimbus Analytics</h1>
          <p>Privacy-first, self-hosted product analytics</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            Create account
          </button>
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === 'register' && (
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ada Lovelace" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </label>
          {mode === 'register' && (
            <label className="field">
              <span>Organization (optional)</span>
              <input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Acme Inc." />
            </label>
          )}

          {error && <div className="error-banner">{error}</div>}

          <Button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
          </Button>

          {mode === 'register' && (
            <p className="auth-note">
              A demo project with ingestion + query API keys is created automatically.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
