import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { rendreApp, simulerApi } from './helpers/rendu.jsx';

beforeEach(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('Reclic sur la page où l’on se trouve', () => {
  it('Mes aides : les choix (profil, besoin) reviennent aux valeurs par défaut et la page remonte', async () => {
    simulerApi({ '/aides': [] });
    rendreApp('/aides?profil=boursier&besoin=urgence');
    const profil = await screen.findByRole('radio', { name: /boursier/i });
    expect(profil).toBeChecked();
    expect(screen.getByLabelText('Besoin')).toHaveValue('urgence');
    window.scrollTo.mockClear();

    const menu = screen.getAllByRole('navigation')[0];
    await userEvent.click(within(menu).getByRole('link', { name: /aides/i }));
    expect(await screen.findByRole('radio', { name: /Étudiant français/i })).toBeChecked();
    expect(screen.getByLabelText('Besoin')).toHaveValue('');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('un choix fait ensuite n’est pas annulé (pas de remise à zéro à chaque changement)', async () => {
    simulerApi({ '/aides': [] });
    rendreApp('/aides');
    await userEvent.click(await screen.findByRole('radio', { name: /boursier/i }));
    expect(screen.getByRole('radio', { name: /boursier/i })).toBeChecked();
    await userEvent.selectOptions(screen.getByLabelText('Besoin'), 'urgence');
    expect(screen.getByRole('radio', { name: /boursier/i })).toBeChecked();
    expect(screen.getByLabelText('Besoin')).toHaveValue('urgence');
  });
});

describe('Changer de page n’emmène pas sur le décompte des résultats', () => {
  it('cliquer un lien du menu ne fait pas défiler vers un message « N aides affichées »', async () => {
    simulerApi({ '/aides': [], '/ressources': [] });
    rendreApp('/a-propos');
    await screen.findByRole('heading', { level: 1, name: 'À propos' });
    Element.prototype.scrollIntoView.mockClear();
    const menu = screen.getAllByRole('navigation')[0];
    await userEvent.click(within(menu).getByRole('link', { name: /aides/i }));
    await screen.findByRole('heading', { level: 1, name: /Aides, entraide et villes/i });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
