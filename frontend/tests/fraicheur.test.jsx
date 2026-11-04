import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Fraicheur from '../src/components/Fraicheur.jsx';

afterEach(cleanup);

describe('Fraicheur (source et date)', () => {
  it('affiche la source et la date de vérification', () => {
    render(
      <Fraicheur
        source={{ organisme: 'FAGE' }}
        verifieLe="2026-09-12T10:00:00Z"
        aVerifier={false}
      />,
    );
    expect(screen.getByText(/Source : FAGE/)).toHaveTextContent('vérifié le 12 septembre 2026');
    expect(screen.queryByText('à vérifier')).not.toBeInTheDocument();
  });

  it('UI-07 : donnée « à vérifier » → mention visible à côté de la valeur', () => {
    render(<Fraicheur source={{ organisme: 'FAGE' }} verifieLe={null} aVerifier />);
    expect(screen.getByText('à vérifier')).toBeVisible();
    expect(screen.getByText(/Source : FAGE/)).toBeInTheDocument();
  });

  it('source absente : le dit clairement', () => {
    render(<Fraicheur source={null} verifieLe={null} aVerifier />);
    expect(screen.getByText(/non précisée/)).toBeInTheDocument();
  });
});
