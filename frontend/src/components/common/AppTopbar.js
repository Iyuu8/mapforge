import { Link, NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import BrandLogo from './BrandLogo';

export default function AppTopbar({ theme = 'light' }) {
  const { isAdmin, isAuthenticated, signOut, user } = useAuth();

  return (
    <header className={`topbar topbar-${theme}`}>
      <BrandLogo theme={theme} />
      <nav className="topbarNav" aria-label="Main navigation">
        <NavLink to="/maps">Browse</NavLink>
        {isAdmin ? <NavLink to="/admin">Admin</NavLink> : null}
      </nav>
      <div className="topbarAccount">
        {isAuthenticated ? (
          <>
            <span className="accountBadge" title={user.email}>
              <span className="userAvatarDot">{(user.email?.[0] || 'A').toUpperCase()}</span>
              <span className="userEmailText">{user.email}</span>
            </span>
            <button className="iconTextButton buttonGhost" type="button" onClick={signOut}>
              <LogOut size={15} />
              <span>Sign out</span>
            </button>
          </>
        ) : (
          <Link className="button buttonPrimary" to="/login">Admin sign in</Link>
        )}
      </div>
    </header>
  );
}
