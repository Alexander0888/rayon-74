import { ArrowLeft } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import { SectionBreadcrumb } from '../../../app/SectionBreadcrumb.jsx';
import { fr } from '../../../content/fr.js';
import { ChristmasStage } from './ChristmasStage.jsx';

function VisitScenePage({ showDepartment }) {
  const account = useOutletContext();
  const isDemo = account.isDemo || (showDepartment && account.workspaceKey === 'local');
  const back = showDepartment ? <SectionBreadcrumb title={fr.sections.visit.title} /> : (
    <nav className="noel-links" aria-label={fr.navigation}>
      <Link className="noel-back" to="/visit"><ArrowLeft aria-hidden="true" />{fr.sections.visit.title}</Link>
    </nav>
  );

  return <ChristmasStage back={back} showDepartment={showDepartment} account={{ ...account, isDemo }} />;
}

export default function ChristmasPage() {
  return <VisitScenePage />;
}

export function DepartmentPage() {
  return <VisitScenePage showDepartment />;
}
