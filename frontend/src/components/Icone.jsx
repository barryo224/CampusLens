// Petites icônes SVG (décoratives : cachées aux lecteurs d'écran).
const CHEMINS = {
  accueil: 'M3 11.5 12 4l9 7.5M5 10v10h14V10',
  calcul: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  ampoule:
    'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  graphique: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  livre: 'M4 4h6v16H4zM14 4h6v16h-6z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  fleche: 'M5 12h14M13 6l6 6-6 6',
  bouclier: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z',
  maison: 'M3 11.5 12 4l9 7.5M6 10v10h12V10M10 20v-6h4v6',
  coeur: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  chapeau: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5',
  oeil: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cadenas: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  document: 'M6 3h9l4 4v14H6zM9 12h6M9 16h6',
};

export default function Icone({ nom, taille = 22 }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={CHEMINS[nom] ?? CHEMINS.info} />
    </svg>
  );
}
