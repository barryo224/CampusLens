import { describe, it, expect } from 'vitest';
import { blocageRobot } from '../src/lib/blocageRobot.js';

describe('blocageRobot', () => {
  it('reconnaît un accès refusé (401, 403, 429)', () => {
    for (const code of [401, 403, 429])
      expect(blocageRobot(`La source a répondu ${code} : https://exemple.fr`)).toMatch(
        /refuse les robots.*à vérifier à la main/,
      );
  });
  it('reconnaît une connexion coupée', () => {
    expect(blocageRobot('Source injoignable (erreur réseau) : https://exemple.fr')).toMatch(
      /ne répond pas aux robots.*à vérifier à la main/,
    );
  });
  it('laisse passer les vraies pannes et les autres messages', () => {
    expect(blocageRobot('La source a répondu 500')).toBeNull();
    expect(blocageRobot('La source a répondu 404')).toBeNull();
    expect(blocageRobot('Page vide ou illisible')).toBeNull();
    expect(blocageRobot(null)).toBeNull();
    expect(blocageRobot(undefined)).toBeNull();
  });
});
