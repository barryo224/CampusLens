import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Accueil from './pages/Accueil.jsx';
import APropos from './pages/APropos.jsx';
import Bientot from './pages/Bientot.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Accueil />} />
        <Route path="evaluer" element={<Bientot titre="Évaluer ma situation" />} />
        <Route path="aides" element={<Bientot titre="Mes aides" />} />
        <Route path="budget" element={<Bientot titre="Préparer mon budget" />} />
        <Route path="ressources" element={<Bientot titre="Ressources" />} />
        <Route path="a-propos" element={<APropos />} />
        <Route path="contact" element={<Bientot titre="Contact" />} />
        <Route
          path="mentions-legales"
          element={<Bientot titre="Mentions légales et confidentialité" />}
        />
        <Route path="*" element={<Bientot titre="Page introuvable" />} />
      </Route>
    </Routes>
  );
}
