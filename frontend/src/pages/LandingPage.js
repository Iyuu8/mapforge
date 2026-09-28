import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Compass, Layers, MapPin, Sparkles, Wrench } from 'lucide-react';
import AppTopbar from '../components/common/AppTopbar';
import useAuth from '../hooks/useAuth';

export default function LandingPage() {
  const { isAdmin, isAuthenticated } = useAuth();
  const adminTarget = isAuthenticated && isAdmin ? '/admin' : '/login';

  return (
    <div className="appFrame landingLayoutFrame">
      <AppTopbar />
      <main className="landingMain">
        <section className="landingHeroSection">
          <div className="landingBadge">
            <Sparkles size={14} className="sparkleIcon" />
            <span>Interactive Campus & Indoor Mapping Platform</span>
          </div>

          <h1 className="landingHeroHeading">
            Turn spaces into <span className="textGradient">interactive maps</span>
          </h1>

          <p className="landingHeroDescription">
            Design, edit, and publish high-performance indoor maps for campuses, buildings, and
            organizations with CAD-grade precision and responsive 2D/3D visualization.
          </p>

          <div className="landingActionGroup" aria-label="MapForge entry paths">
            <Link className="button buttonPrimary landingPrimaryBtn" to="/maps">
              <Compass size={19} />
              <span>Browse Campus Maps</span>
              <ArrowRight size={17} />
            </Link>
            <Link className="button buttonGhost landingSecondaryBtn" to={adminTarget}>
              {isAuthenticated && isAdmin ? <Wrench size={19} /> : <Building2 size={19} />}
              <span>{isAuthenticated && isAdmin ? 'Admin Workspace' : 'Admin Sign In'}</span>
            </Link>
          </div>

          {/* Campus Visual Showcase */}
          <div className="landingShowcaseContainer">
            <div className="showcaseCardFrame">
              <img
                src="/assets/campus_hero.jpg"
                alt="Interactive Campus Map Visual"
                className="showcaseImage"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="showcaseFloatTag showcaseFloatTagTop">
                <div className="pulseDot" />
                <span>Live Interactive View</span>
              </div>
              <div className="showcaseFloatTag showcaseFloatTagBottom">
                <MapPin size={16} />
                <span>Campus Navigation & POIs</span>
              </div>
            </div>
          </div>

          {/* Features Highlights */}
          <div className="landingFeaturesGrid">
            <div className="landingFeatureCard">
              <div className="featureCardIcon">
                <Layers size={22} />
              </div>
              <h3>Multi-Floor Hierarchies</h3>
              <p>Organize organizations, campuses, buildings, and floor levels with custom dimensions.</p>
            </div>
            <div className="landingFeatureCard">
              <div className="featureCardIcon">
                <Compass size={22} />
              </div>
              <h3>Intelligent Pathfinding</h3>
              <p>Automated graph-based routing across hallways, stairs, and elevators with accessible paths.</p>
            </div>
            <div className="landingFeatureCard">
              <div className="featureCardIcon">
                <Building2 size={22} />
              </div>
              <h3>Figma-Grade CAD Editor</h3>
              <p>Hardware-accelerated 60fps canvas with polygon tracing, node snapping, and blueprint overlays.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
