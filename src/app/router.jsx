import { createHashRouter, Navigate } from 'react-router';
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
      { path: 'visit', lazy: async () => ({ Component: (await import('../features/visit/christmas/ChristmasPage.jsx')).DepartmentPage }) },
      { path: 'visit/noel', lazy: async () => ({ Component: (await import('../features/visit/christmas/ChristmasPage.jsx')).default }) },
      { path: 'visit/rayon', element: <Navigate to="/visit" replace /> },
      { path: 'waste', lazy: async () => ({ Component: (await import('../features/waste/WastePage.jsx')).default }) },
      { path: 'orders', lazy: async () => ({ Component: (await import('../features/orders/OrdersPage.jsx')).default }) },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
