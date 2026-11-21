import { createHashRouter } from 'react-router';
import App from '../App.jsx';
import HomePage from '../pages/HomePage.jsx';
import HerbsPage from '../features/herbs/HerbsPage.jsx';
import { NotFoundPage, RouteErrorPage } from '../pages/NotFoundPage.jsx';
import { fr } from '../content/fr.js';

function LoadingRoute() {
  return <main className="page-width main" role="status">{fr.loading}</main>;
}

// Hash paths work on static hosting without server rewrite rules.
export const router = createHashRouter([
  {
    path: '/',
    Component: App,
    ErrorBoundary: RouteErrorPage,
    HydrateFallback: LoadingRoute,
    children: [
      { index: true, Component: HomePage },
      { path: 'herbs', Component: HerbsPage },
      { path: 'waste', lazy: async () => ({ Component: (await import('../features/waste/WastePage.jsx')).default }) },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
