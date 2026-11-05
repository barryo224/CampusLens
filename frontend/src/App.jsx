import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Accueil from './pages/Accueil.jsx';
import Evaluer from './pages/Evaluer.jsx';
import Aides from './pages/Aides.jsx';
import Budget from './pages/Budget.jsx';
import Ressources from './pages/Ressources.jsx';
import APropos from './pages/APropos.jsx';
import Contact from './pages/Contact.jsx';
import MentionsLegales from './pages/MentionsLegales.jsx';

// L'administration n'est téléchargée que lorsqu'on l'ouvre : les visiteurs du site public ne la chargent jamais.
const AdminLayout = lazy(() => import('./pages/Admin.jsx'));
const page = (nom) => lazy(() => import('./pages/Admin.jsx').then((m) => ({ default: m[nom] })));
const PageChangements = page('PageChangements');
const PageSources = page('PageSources');
const PageHistorique = page('PageHistorique');
const PageMessages = page('PageMessages');
const PageCompte = page('PageCompte');
const AccueilAdmin = page('AccueilAdmin');
import Bientot from './pages/Bientot.jsx';

export default function App() {
  return (
    <Suspense
      fallback={
        <p className="message" role="status" style={{ margin: 24 }}>
          Chargement…
        </p>
      }
    >
      <Routes>
        {/* Espace administration : sa propre mise en page, sans le menu du site public. */}
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AccueilAdmin />} />
          <Route path="changements" element={<PageChangements />} />
          <Route path="sources" element={<PageSources />} />
          <Route path="historique" element={<PageHistorique />} />
          <Route path="messages" element={<PageMessages />} />
          <Route path="compte" element={<PageCompte />} />
          <Route path="*" element={<AccueilAdmin />} />
        </Route>
        <Route element={<Layout />}>
          <Route index element={<Accueil />} />
          <Route path="evaluer" element={<Evaluer />} />
          <Route path="aides" element={<Aides />} />
          <Route path="budget" element={<Budget />} />
          <Route path="ressources" element={<Ressources />} />
          <Route path="a-propos" element={<APropos />} />
          <Route path="contact" element={<Contact />} />
          <Route path="mentions-legales" element={<MentionsLegales />} />
          <Route path="*" element={<Bientot titre="Page introuvable" />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
