import { useEffect } from 'react';
import { Link, useOutletContext } from 'react-router';
import {
  ArrowRight, Bell, BookOpen, Box, Camera, ChartNoAxesColumn, ClipboardCheck,
  ClipboardList, Leaf, Map, MessageCircle, PackagePlus, ScanLine, ShoppingCart, Tag, Tags,
} from 'lucide-react';
import { AppHeader } from '../app/AppHeader.jsx';
import { fr, pageTitle } from '../content/fr.js';

const sections = [
  { id: 'herbs', Icon: Leaf, to: '/herbs' },
  { id: 'waste', Icon: ChartNoAxesColumn, to: '/waste' },
  { id: 'orders', Icon: ClipboardList, to: '/orders' },
  { id: 'visit', Icon: Map },
  { id: 'automaticOrders', Icon: ShoppingCart, ai: true },
  { id: 'chatbot', Icon: MessageCircle, ai: true },
  { id: 'promotionSigns', Icon: Tags },
  { id: 'catalog', Icon: BookOpen },
  { id: 'labels', Icon: ScanLine },
  { id: 'promotions', Icon: Tag },
  { id: 'assortmentAlerts', Icon: Bell },
  { id: 'oliveRestock', Icon: PackagePlus, ai: true },
  { id: 'missingLabels', Icon: Tag },
  { id: 'qualityClaims', Icon: Camera },
  { id: 'simulation', Icon: Box },
  { id: 'teamTasks', Icon: ClipboardCheck },
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
          {sections.map(({ id, Icon, to, ai }) => {
            const { title, description } = fr.sections[id];
            const Card = to ? Link : 'article';
            const classes = ['section-card', to ? 'section-ready' : 'section-planned'];
            if (ai) classes.push('section-ai');

            return (
              <li key={id}>
                <Card className={classes.join(' ')} to={to}>
                  <Icon className="section-icon" size={24} strokeWidth={1.5} aria-hidden="true" />
                  {ai && <span className="section-ai-badge">{fr.aiBadge}</span>}
                  <h2>{title}</h2>
                  <p>{description}</p>
                  <span className="section-status">
                    {to ? <span className="section-open">{fr.openSection}<ArrowRight size={17} aria-hidden="true" /></span> : fr.inDevelopment}
                  </span>
                </Card>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
