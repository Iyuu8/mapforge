import { Link, useParams } from 'react-router-dom';
import AppTopbar from '../components/common/AppTopbar';
import StatusMessage from '../components/common/StatusMessage';

export default function PlaceholderPage({ title, phase }) {
  const { organizationId } = useParams();

  return (
    <div className="appFrame">
      <AppTopbar />
      <main className="centeredPage">
        <StatusMessage title={`${title} starts in ${phase}`} tone="warning">
          Organization {organizationId} is wired through routing. The canvas and graph model are intentionally deferred to the next frontend phase.
        </StatusMessage>
        <Link className="button buttonGhost" to="/maps">Back to organizations</Link>
      </main>
    </div>
  );
}
