import { Link, NavLink } from 'react-router-dom';
import { LogOut, Map, Shield } from 'lucide-react';
import useAuth from '../../hooks/useAuth';

export default function AppTopbar() {
  const { isAdmin, isAuthenticated, signOut, user } = useAuth();

  return (
    <header className="topbar">
      <Link to="/" className="brandMark" aria-label="MapForge home">
        <span className="brandIcon"><Map size={18} /></span>
        <span>MapForge</span>
      </Link>
      <nav className="topbarNav" aria-label="Main navigation">
        <NavLink to="/maps">Browse</NavLink>
        {isAdmin ? <NavLink to="/admin">Admin</NavLink> : null}
      </nav>
      <div className="topbarAccount">
        {isAuthenticated ? (
          <>
            <span className="accountBadge">
              <Shield size={14} />
              {user.email}
            </span>
            <button className="iconTextButton" type="button" onClick={signOut}>
              <LogOut size={16} />
              Sign out
            </button>
          </>
        ) : (
          <Link className="button buttonGhost" to="/login">Admin sign in</Link>
        )}
      </div>
    </header>
  );
}
