import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import AppTopbar from '../components/common/AppTopbar';
import StatusMessage from '../components/common/StatusMessage';
import useAuth from '../hooks/useAuth';

export default function LoginPage() {
  const { signIn, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/admin';

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn(form);
      navigate(from, { replace: true });
    } catch (apiError) {
      setError(apiError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="appFrame">
      <AppTopbar />
      <main className="authPage">
        <section className="authPanel">
          <p className="eyebrow">Administrator access</p>
          <h1>Sign in to MapForge</h1>
          <p className="mutedText">
            Public browsing stays open. Admin actions use the backend cookie session.
          </p>

          {isAdmin ? (
            <StatusMessage title="Already signed in" tone="success">
              You can open the admin organization picker.
            </StatusMessage>
          ) : null}

          {error ? (
            <StatusMessage title={error.code || 'Sign in failed'} tone="error">
              {error.message}
            </StatusMessage>
          ) : null}

          <form className="stackedForm" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="button buttonPrimary" type="submit" disabled={submitting}>
              <LogIn size={18} />
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <Link className="inlineLink" to="/maps">Continue as a public viewer</Link>
        </section>
      </main>
    </div>
  );
}
