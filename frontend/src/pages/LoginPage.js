import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Mail,
  MapPin,
  Share2,
} from 'lucide-react';
import AppTopbar from '../components/common/AppTopbar';
import BrandLogo from '../components/common/BrandLogo';
import StatusMessage from '../components/common/StatusMessage';
import useAuth from '../hooks/useAuth';

export default function LoginPage() {
  const { signIn, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
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
    <div className="appFrame authLayoutFrame">
      <AppTopbar />
      <main className="authSplitPage">
        {/* Left Hero Column */}
        <section className="authHeroCol">
          <div className="authHeroHeader">
            <BrandLogo size="large" />
            <h1 className="authHeroTitle">Turn spaces into interactive maps</h1>
            <p className="authHeroSubtitle">
              Design, edit and publish indoor maps for your campus, buildings and
              organizations — made for everyone.
            </p>
          </div>

          <div className="authFeatureList">
            <div className="authFeatureItem">
              <span className="authFeatureIcon">
                <Layers size={18} />
              </span>
              <span>Create detailed floor plans</span>
            </div>
            <div className="authFeatureItem">
              <span className="authFeatureIcon">
                <MapPin size={18} />
              </span>
              <span>Add points of interest and routes</span>
            </div>
            <div className="authFeatureItem">
              <span className="authFeatureIcon">
                <Share2 size={18} />
              </span>
              <span>Publish and share with your community</span>
            </div>
          </div>

          <div className="authHeroVisualWrapper">
            <div className="authHeroImageCard">
              <img
                src="/assets/campus_hero.jpg"
                alt="3D isometric campus layout map"
                className="authHeroImage"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="authHeroPinMarker" title="Active Campus Hub">
                <MapPin size={20} />
              </div>
            </div>
          </div>

          <div className="authTrustFooter">
            <p>Trusted by universities, campuses and organizations</p>
          </div>
        </section>

        {/* Right Form Card Column */}
        <section className="authCardCol">
          <div className="authCard">
            <div className="authCardHeader">
              <div className="authCardLogoBadge">
                <BrandLogo showText={false} size="large" />
              </div>
              <h2>Welcome back</h2>
              <p>Sign in to your MapForge account</p>
            </div>

            {isAdmin ? (
              <StatusMessage title="Already signed in" tone="success">
                You have admin privileges. <Link to="/admin" style={{ textDecoration: 'underline' }}>Open Admin Dashboard</Link>
              </StatusMessage>
            ) : null}

            {error ? (
              <StatusMessage title={error.code || 'Sign in failed'} tone="error">
                {error.message}
              </StatusMessage>
            ) : null}

            <form className="modernAuthForm" onSubmit={handleSubmit}>
              <div className="formField">
                <label htmlFor="login-email">Email</label>
                <div className="inputWithIcon">
                  <Mail className="fieldIcon" size={17} />
                  <input
                    id="login-email"
                    type="email"
                    placeholder="you@domain.com"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="formField">
                <label htmlFor="login-password">Password</label>
                <div className="inputWithIcon">
                  <Lock className="fieldIcon" size={17} />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="passwordToggleBtn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="authCardOptions">
                <label className="rememberMeLabel">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
                <span className="forgotPasswordLink">Forgot password?</span>
              </div>

              <button
                className="button buttonPrimary authSubmitButton"
                type="submit"
                disabled={submitting}
              >
                <span>{submitting ? 'Signing in...' : 'Sign in'}</span>
                <ArrowRight size={17} />
              </button>
            </form>

            <div className="socialDivider">
              <span>or continue with</span>
            </div>

            <div className="socialButtonsGrid">
              <button
                type="button"
                className="socialAuthBtn"
                onClick={() => {
                  setForm({ email: 'admin@mapforge.io', password: 'password123' });
                }}
                title="Fill demo credentials"
              >
                <svg className="socialSvg" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27A7.18 7.18 0 0 1 4.9 12c0-.79.14-1.57.38-2.27V6.58H1.25A11.967 11.967 0 0 0 0 12c0 1.92.45 3.74 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                className="socialAuthBtn"
                onClick={() => {
                  setForm({ email: 'admin@gmail.com', password: 'admin' });
                }}
                title="Fill demo credentials"
              >
                <svg className="socialSvg" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>GitHub</span>
              </button>
            </div>

            <div className="authCardFooter">
              <p>
                Don't have an account?{' '}
                <Link to="/maps" className="authAccentLink">
                  Create one
                </Link>
              </p>
              <Link to="/maps" className="guestViewerLink">
                Continue as a public viewer &rarr;
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
