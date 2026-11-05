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
import AdminLayout, {
  PageChangements,
  PageSources,
  PageHistorique,
  PageMessages,
  AccueilAdmin,
} from './pages/Admin.jsx';
import Bientot from './pages/Bientot.jsx';

export default function App() {
  return (
    <Routes>
      {/* Espace administration : sa propre mise en page, sans le menu du site public. */}
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AccueilAdmin />} />
        <Route path="changements" element={<PageChangements />} />
        <Route path="sources" element={<PageSources />} />
        <Route path="historique" element={<PageHistorique />} />
        <Route path="messages" element={<PageMessages />} />
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
  );
}
