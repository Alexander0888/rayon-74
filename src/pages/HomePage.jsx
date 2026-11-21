import { useEffect } from 'react';
import { Link, useOutletContext } from 'react-router';
import { ArrowRight, ChartNoAxesColumn, ClipboardList, Leaf, Map, ScanLine, Tag } from 'lucide-react';
import { AppHeader } from '../app/AppHeader.jsx';
import { fr, pageTitle } from '../content/fr.js';

const sections = [
  { id: 'herbs', Icon: Leaf, to: '/herbs' },
  { id: 'visit', Icon: Map },
  { id: 'waste', Icon: ChartNoAxesColumn, to: '/waste' },
  { id: 'orders', Icon: ClipboardList },
  { id: 'labels', Icon: ScanLine },
  { id: 'promotions', Icon: Tag },
];

export default function HomePage() {
  const account = useOutletContext();
  useEffect(() => { document.title = pageTitle(); }, []);

  return (
    <>
      <AppHeader {...account} />
      <main className="page-width main home-page" id="main-content" tabIndex={-1}>
        <header className="page-heading home-heading">
          <h1>{fr.homeTitle}</h1>
          <p className="secondary">{fr.homeDescription}</p>
        </header>
        {account.signOutError && <p className="notice error" role="alert">{fr.connectionError}</p>}
        <ul className="section-grid" aria-label={fr.sectionsLabel}>
          {sections.map(({ id, Icon, to }) => {
            const { title, description } = fr.sections[id];
            const content = (
              <>
                <Icon className="section-icon" size={24} strokeWidth={1.5} aria-hidden="true" />
                <h2>{title}</h2>
                <p>{description}</p>
                <span className="section-status">
                  {to ? <>{fr.openSection}<ArrowRight size={17} aria-hidden="true" /></> : fr.inDevelopment}
                </span>
              </>
            );
            return (
              <li key={id}>
                {to ? <Link className="section-card section-ready" to={to}>{content}</Link>
                  : <article className="section-card section-planned">{content}</article>}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
