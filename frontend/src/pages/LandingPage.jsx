import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Compass } from 'lucide-react';
import AppTopbar from '../components/common/AppTopbar';

export default function LandingPage() {
  return (
    <div className="appFrame">
      <AppTopbar />
      <main className="landing">
        <section className="landingHero">
          <div className="heroCopy">
            <p className="eyebrow">Indoor mapping for real spaces</p>
            <h1>MapForge</h1>
            <p>
              Build organization maps, publish navigable indoor layouts, and keep the
              authoring surface ready for future agent tools.
            </p>
          </div>
          <div className="heroActions" aria-label="MapForge entry paths">
            <Link className="entryTile" to="/maps">
              <Compass size={28} />
              <span>
                <strong>Browse a Map</strong>
                <small>Open published organizations without signing in.</small>
              </span>
              <ArrowRight size={20} />
            </Link>
            <Link className="entryTile" to="/login">
              <Building2 size={28} />
              <span>
                <strong>Admin Sign In</strong>
                <small>Create, publish, and prepare maps for editing.</small>
              </span>
              <ArrowRight size={20} />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
