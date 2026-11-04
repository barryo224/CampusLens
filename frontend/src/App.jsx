import { Routes, Route } from 'react-router-dom';

// Page provisoire : les six pages arrivent à la phase 5.
function Accueil() {
  return (
    <main>
      <h1>CampusLens</h1>
      <p>Comprendre pour agir ensemble.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Accueil />} />
    </Routes>
  );
}
