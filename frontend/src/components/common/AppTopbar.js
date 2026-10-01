import { Link, NavLink } from 'react-router-dom';
import { Building, LogOut, ShieldCheck } from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import BrandLogo from './BrandLogo';

export default function AppTopbar({ theme = 'light' }) {
  const { isAdmin, isSuperAdmin, isOrganization, isAuthenticated, signOut, user } = useAuth();

  return (
    <header className={`topbar topbar-${theme}`}>
      <BrandLogo theme={theme} />
      <nav className="topbarNav" aria-label="Main navigation">
        <NavLink to="/maps">Browse Maps</NavLink>
        {isSuperAdmin && (
          <NavLink to="/super-admin" className="superAdminNavLink">
            <ShieldCheck size={15} />
            <span>Super Admin</span>
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/admin">
            {isOrganization && !isSuperAdmin ? 'My Studio' : 'Workspace'}
          </NavLink>
        )}
      </nav>
      <div className="topbarAccount">
        {isAuthenticated ? (
          <>
            <div className="userAccountInfoBlock">
              <span className="accountBadge" title={user.email}>
                <span className="userAvatarDot">
                  {(user.email?.[0] || 'A').toUpperCase()}
                </span>
                <span className="userEmailText">{user.email}</span>
              </span>
              {isSuperAdmin && <span className="roleTag superAdminTag">Super Admin</span>}
              {isOrganization && !isSuperAdmin && (
                <span className="roleTag orgTag">Organization</span>
              )}
            </div>
            <button
              className="iconTextButton buttonGhost topbarSignOutBtn"
              type="button"
              onClick={signOut}
              title="Sign out of MapForge"
            >
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          </>
        ) : (
          <div className="guestNavButtons">
            <Link
              className="button buttonGhost topbarRegisterOrgBtn"
              to="/login"
              state={{ mode: 'register_org' }}
            >
              <Building size={15} />
              <span>Register Organization</span>
            </Link>
            <Link className="button buttonPrimary" to="/login">
              Sign In
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
