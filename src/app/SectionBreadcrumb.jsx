import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { fr } from '../content/fr.js';

export function SectionBreadcrumb({ title }) {
  return (
    <nav className="breadcrumb" aria-label={fr.navigation}>
      <Link to="/"><ArrowLeft size={16} aria-hidden="true" />{fr.home}</Link>
      <span aria-hidden="true">/</span><span aria-current="page">{title}</span>
    </nav>
  );
}
