import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Mail,
  MapPin,
  Phone,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import AppTopbar from '../components/common/AppTopbar';
import BrandLogo from '../components/common/BrandLogo';
import StatusMessage from '../components/common/StatusMessage';
import useAuth from '../hooks/useAuth';

export default function LoginPage() {
  const { signIn, registerUser, requestOrganization, isAdmin, isSuperAdmin, isOrganization } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Mode: 'login' | 'register_user' | 'register_org'
  const [mode, setMode] = useState(location.state?.mode || 'login');

  // Login form state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  // Regular user registration form state
  const [userForm, setUserForm] = useState({ email: '', password: '', confirmPassword: '' });

  // Organization registration form state
  const [orgForm, setOrgForm] = useState({
    organizationName: '',
    address: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    description: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [orgRequestSuccess, setOrgRequestSuccess] = useState(null);

  const from = location.state?.from?.pathname || (isSuperAdmin ? '/super-admin' : isAdmin ? '/admin' : '/maps');

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn(loginForm);
      navigate(from, { replace: true });
    } catch (apiError) {
      setError(apiError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUserRegisterSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    if (userForm.password !== userForm.confirmPassword) {
      setError({ message: 'Passwords do not match. Please verify and try again.' });
      setSubmitting(false);
      return;
    }

    try {
      await registerUser({ email: userForm.email, password: userForm.password });
      navigate('/maps', { replace: true });
    } catch (apiError) {
      setError(apiError);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOrgRegisterSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    if (orgForm.password !== orgForm.confirmPassword) {
      setError({ message: 'Passwords do not match. Please verify and try again.' });
      setSubmitting(false);
      return;
    }

    try {
      const response = await requestOrganization({
        organizationName: orgForm.organizationName,
        address: orgForm.address,
        phone: orgForm.phone,
        email: orgForm.email,
        password: orgForm.password,
        description: orgForm.description,
      });

      setOrgRequestSuccess({
        message: response.message || 'Organization request submitted successfully.',
        data: response.data,
      });
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
              organizations — backed by multi-tenant organization isolation.
            </p>
          </div>

          <div className="authFeatureList">
            <div className="authFeatureItem">
              <span className="authFeatureIcon">
                <ShieldCheck size={18} />
              </span>
              <span>Super Admin verified organization onboarding</span>
            </div>
            <div className="authFeatureItem">
              <span className="authFeatureIcon">
                <Building size={18} />
              </span>
              <span>Horizontal security: isolated maps per organization</span>
            </div>
            <div className="authFeatureItem">
              <span className="authFeatureIcon">
                <Layers size={18} />
              </span>
              <span>Interactive multi-floor indoor mapping & route tracing</span>
            </div>
            <div className="authFeatureItem">
              <span className="authFeatureIcon">
                <Share2 size={18} />
              </span>
              <span>Instant sharing for public viewers and visitors</span>
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
            <p>Designed for universities, campuses, hospitals, and enterprises</p>
          </div>
        </section>

        {/* Right Form Card Column */}
        <section className="authCardCol">
          <div className="authCard">
            {/* Mode Switcher Tabs */}
            <div className="authTabsContainer" role="tablist">
              <button
                type="button"
                className={`authTabButton ${mode === 'login' ? 'active' : ''}`}
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setOrgRequestSuccess(null);
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`authTabButton ${mode === 'register_user' ? 'active' : ''}`}
                onClick={() => {
                  setMode('register_user');
                  setError(null);
                  setOrgRequestSuccess(null);
                }}
              >
                Create Account
              </button>
              <button
                type="button"
                className={`authTabButton ${mode === 'register_org' ? 'active' : ''}`}
                onClick={() => {
                  setMode('register_org');
                  setError(null);
                  setOrgRequestSuccess(null);
                }}
              >
                Register Organization
              </button>
            </div>

            {/* Header Description */}
            <div className="authCardHeader">
              <div className="authCardLogoBadge">
                <BrandLogo showText={false} size="large" />
              </div>
              {mode === 'login' && (
                <>
                  <h2>Welcome back</h2>
                  <p>Sign in to your MapForge account</p>
                </>
              )}
              {mode === 'register_user' && (
                <>
                  <h2>Create your account</h2>
                  <p>Browse public maps, search places, and plan routes</p>
                </>
              )}
              {mode === 'register_org' && (
                <>
                  <h2>Register Organization</h2>
                  <p>Apply to manage your organization's campus and indoor maps</p>
                </>
              )}
            </div>

            {/* Already Signed In Status */}
            {isSuperAdmin && (
              <StatusMessage title="Super Admin Session Active" tone="success">
                You have Super Admin privileges.{' '}
                <Link to="/super-admin" style={{ textDecoration: 'underline', fontWeight: 600 }}>
                  Open Super Admin Dashboard
                </Link>
              </StatusMessage>
            )}

            {isOrganization && !isSuperAdmin && (
              <StatusMessage title="Organization Account Active" tone="success">
                You are logged in as an organization administrator.{' '}
                <Link to="/admin" style={{ textDecoration: 'underline', fontWeight: 600 }}>
                  Open Organization Studio
                </Link>
              </StatusMessage>
            )}

            {/* Errors */}
            {error && (
              <StatusMessage title={error.code || 'Operation failed'} tone="error">
                {error.message || 'An unexpected error occurred. Please try again.'}
              </StatusMessage>
            )}

            {/* 1. SIGN IN FORM */}
            {mode === 'login' && (
              <form className="modernAuthForm" onSubmit={handleLoginSubmit}>
                <div className="formField">
                  <label htmlFor="login-email">Email</label>
                  <div className="inputWithIcon">
                    <Mail className="fieldIcon" size={17} />
                    <input
                      id="login-email"
                      type="email"
                      placeholder="admin@gmail.com"
                      value={loginForm.email}
                      onChange={(event) =>
                        setLoginForm({ ...loginForm, email: event.target.value })
                      }
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
                      value={loginForm.password}
                      onChange={(event) =>
                        setLoginForm({ ...loginForm, password: event.target.value })
                      }
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

                <div className="socialDivider">
                  <span>quick demo sign-in</span>
                </div>

                <div className="socialButtonsGrid">
                  <button
                    type="button"
                    className="socialAuthBtn demoSuperAdminBtn"
                    onClick={() => {
                      setLoginForm({ email: 'admin@gmail.com', password: 'password' });
                    }}
                    title="Fill Super Admin Credentials"
                  >
                    <ShieldCheck size={16} color="#6366f1" />
                    <span>Super Admin</span>
                  </button>

                  <button
                    type="button"
                    className="socialAuthBtn"
                    onClick={() => {
                      setMode('register_org');
                    }}
                    title="Request New Organization Account"
                  >
                    <Building size={16} color="#0ea5e9" />
                    <span>New Org Account</span>
                  </button>
                </div>
              </form>
            )}

            {/* 2. REGULAR USER SIGN UP FORM */}
            {mode === 'register_user' && (
              <form className="modernAuthForm" onSubmit={handleUserRegisterSubmit}>
                <div className="formField">
                  <label htmlFor="user-email">Email Address</label>
                  <div className="inputWithIcon">
                    <Mail className="fieldIcon" size={17} />
                    <input
                      id="user-email"
                      type="email"
                      placeholder="you@domain.com"
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="formField">
                  <label htmlFor="user-password">Password (minimum 8 characters)</label>
                  <div className="inputWithIcon">
                    <Lock className="fieldIcon" size={17} />
                    <input
                      id="user-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      className="passwordToggleBtn"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="formField">
                  <label htmlFor="user-confirm-password">Confirm Password</label>
                  <div className="inputWithIcon">
                    <Lock className="fieldIcon" size={17} />
                    <input
                      id="user-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      value={userForm.confirmPassword}
                      onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <button
                  className="button buttonPrimary authSubmitButton"
                  type="submit"
                  disabled={submitting}
                >
                  <span>{submitting ? 'Creating account...' : 'Create Account'}</span>
                  <ArrowRight size={17} />
                </button>
              </form>
            )}

            {/* 3. ORGANIZATION REGISTRATION REQUEST FORM */}
            {mode === 'register_org' && (
              <>
                {orgRequestSuccess ? (
                  <div className="orgSuccessCard">
                    <div className="orgSuccessIcon">
                      <CheckCircle2 size={44} color="#10b981" />
                    </div>
                    <h3>Request Submitted Successfully!</h3>
                    <p className="orgSuccessText">
                      Your organization registration for{' '}
                      <strong>{orgRequestSuccess.data?.organizationName}</strong> has been
                      forwarded to our Super Admin team for validation.
                    </p>
                    <div className="orgNoticeBadge">
                      <Clock size={16} />
                      <span>
                        Organization accounts are verified by a Super Admin before activation. Once approved in the Super Admin dashboard, you will be able to sign in and begin designing your maps.
                      </span>
                    </div>
                    <button
                      className="button buttonPrimary"
                      onClick={() => {
                        setOrgRequestSuccess(null);
                        setMode('login');
                      }}
                    >
                      Back to Sign In
                    </button>
                  </div>
                ) : (
                  <form className="modernAuthForm" onSubmit={handleOrgRegisterSubmit}>
                    <div className="orgRequirementNotice">
                      <Building size={16} />
                      <span>
                        Creating an organization account requires additional information. A Super Admin must validate and approve this request before the account is activated.
                      </span>
                    </div>

                    <div className="formField">
                      <label htmlFor="org-name">Organization / Campus Name *</label>
                      <div className="inputWithIcon">
                        <Building className="fieldIcon" size={17} />
                        <input
                          id="org-name"
                          type="text"
                          placeholder="e.g. Stanford University Campus"
                          value={orgForm.organizationName}
                          onChange={(e) =>
                            setOrgForm({ ...orgForm, organizationName: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="formField">
                      <label htmlFor="org-address">Organization Address *</label>
                      <div className="inputWithIcon">
                        <MapPin className="fieldIcon" size={17} />
                        <input
                          id="org-address"
                          type="text"
                          placeholder="e.g. 450 Serra Mall, Stanford, CA 94305"
                          value={orgForm.address}
                          onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="formField">
                      <label htmlFor="org-phone">Phone Number *</label>
                      <div className="inputWithIcon">
                        <Phone className="fieldIcon" size={17} />
                        <input
                          id="org-phone"
                          type="tel"
                          placeholder="e.g. +1 (650) 723-2300"
                          value={orgForm.phone}
                          onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="formField">
                      <label htmlFor="org-email">Account Email *</label>
                      <div className="inputWithIcon">
                        <Mail className="fieldIcon" size={17} />
                        <input
                          id="org-email"
                          type="email"
                          placeholder="admin@campus.edu"
                          value={orgForm.email}
                          onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="formField">
                      <label htmlFor="org-password">Account Password * (min 8 chars)</label>
                      <div className="inputWithIcon">
                        <Lock className="fieldIcon" size={17} />
                        <input
                          id="org-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••••••"
                          value={orgForm.password}
                          onChange={(e) => setOrgForm({ ...orgForm, password: e.target.value })}
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          className="passwordToggleBtn"
                          onClick={() => setShowPassword((prev) => !prev)}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="formField">
                      <label htmlFor="org-confirm-password">Confirm Password *</label>
                      <div className="inputWithIcon">
                        <Lock className="fieldIcon" size={17} />
                        <input
                          id="org-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••••••"
                          value={orgForm.confirmPassword}
                          onChange={(e) =>
                            setOrgForm({ ...orgForm, confirmPassword: e.target.value })
                          }
                          required
                          minLength={8}
                        />
                      </div>
                    </div>

                    <div className="formField">
                      <label htmlFor="org-desc">Organization Description (Optional)</label>
                      <textarea
                        id="org-desc"
                        rows={2}
                        className="authTextarea"
                        placeholder="Brief overview of your campus, facilities or venue..."
                        value={orgForm.description}
                        onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })}
                      />
                    </div>

                    <button
                      className="button buttonPrimary authSubmitButton"
                      type="submit"
                      disabled={submitting}
                    >
                      <span>
                        {submitting ? 'Submitting Application...' : 'Submit Organization Application'}
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  </form>
                )}
              </>
            )}

            <div className="authCardFooter">
              {mode !== 'login' ? (
                <p>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setOrgRequestSuccess(null);
                    }}
                    className="authInlineSwitchBtn"
                  >
                    Sign in here
                  </button>
                </p>
              ) : (
                <p>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register_user');
                      setError(null);
                      setOrgRequestSuccess(null);
                    }}
                    className="authInlineSwitchBtn"
                  >
                    Create account
                  </button>
                  {' • '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register_org');
                      setError(null);
                      setOrgRequestSuccess(null);
                    }}
                    className="authInlineSwitchBtn"
                  >
                    Register organization
                  </button>
                </p>
              )}
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
