import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prismaTest, viderBase } from '../helpers/db.js';
import { createApp } from '../../src/app.js';
import { chiffreurDepuisEnv } from '../../src/lib/chiffrement.js';
import {
  codePourPas,
  pasDeTemps,
  verifierCode,
  decoderBase32,
  encoderBase32,
  genererSecret,
  adresseOtpauth,
} from '../../src/admin/totp.js';
import { genererCodesSecours, empreinteCode, trouverCode } from '../../src/admin/codes-secours.js';

const MDP = 'un-mot-de-passe-solide-2026';

describe('TOTP : l’algorithme (RFC 6238)', () => {
  // Vecteurs de test officiels de la RFC 6238 : clé ASCII « 12345678901234567890 », code à 8 chiffres.
  const CLE_RFC = encoderBase32(Buffer.from('12345678901234567890'));
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('à %i s : %s (vecteur officiel)', (secondes, attendu) => {
    expect(codePourPas(CLE_RFC, Math.floor(secondes / 30), 8)).toBe(attendu);
    expect(codePourPas(CLE_RFC, Math.floor(secondes / 30), 6)).toBe(attendu.slice(-6)); // 6 chiffres = les 6 derniers
  });

  it('base32 : aller-retour, insensible aux espaces, minuscules et tirets ; refuse les caractères invalides', () => {
    for (let i = 0; i < 20; i++) {
      const s = genererSecret();
      expect(s).toMatch(/^[A-Z2-7]{32}$/);
      expect(encoderBase32(decoderBase32(s))).toBe(s);
    }
    const s = genererSecret();
    expect(decoderBase32(`${s.slice(0, 4).toLowerCase()} ${s.slice(4)}`)).toEqual(decoderBase32(s));
    expect(() => decoderBase32('AB!@')).toThrow();
  });

  it('accepte le pas courant et ses voisins (décalage d’horloge), pas plus ; refuse un format incorrect', () => {
    const s = genererSecret();
    const maintenantMs = 1_700_000_000_000;
    const p = pasDeTemps(maintenantMs);
    for (const pas of [p - 1, p, p + 1])
      expect(verifierCode(s, codePourPas(s, pas), { maintenantMs })).toBe(pas);
    for (const pas of [p - 2, p + 2, p + 100])
      expect(verifierCode(s, codePourPas(s, pas), { maintenantMs })).toBeNull();
    for (const mauvais of ['', '12345', '1234567', 'abcdef', '12 34 5', null, undefined]) {
      expect(verifierCode(s, mauvais, { maintenantMs })).toBeNull();
    }
    // Les espaces saisis par commodité (« 123 456 ») sont tolérés.
    const code = codePourPas(s, p);
    expect(verifierCode(s, `${code.slice(0, 3)} ${code.slice(3)}`, { maintenantMs })).toBe(p);
  });

  it('un code ne sert qu’UNE fois (anti-rejeu)', () => {
    const s = genererSecret();
    const maintenantMs = 1_700_000_000_000;
    const p = pasDeTemps(maintenantMs);
    const code = codePourPas(s, p);
    expect(verifierCode(s, code, { maintenantMs })).toBe(p);
    expect(verifierCode(s, code, { maintenantMs, dernierPas: p })).toBeNull(); // déjà utilisé
    expect(verifierCode(s, codePourPas(s, p - 1), { maintenantMs, dernierPas: p })).toBeNull(); // plus ancien : refusé
    expect(verifierCode(s, codePourPas(s, p + 1), { maintenantMs, dernierPas: p })).toBe(p + 1);
  });

  it('l’adresse otpauth contient la clé et l’émetteur', () => {
    const a = adresseOtpauth({ secret: 'ABCDEFGH', email: 'a@test.fr' });
    expect(a).toMatch(
      /^otpauth:\/\/totp\/CampusLens%3Aa%40test\.fr\?secret=ABCDEFGH&issuer=CampusLens/,
    );
  });
});

describe('Codes de secours', () => {
  it('8 codes uniques au format XXXXX-XXXXX ; stockés sous forme d’empreintes ; reconnus quelle que soit la saisie', () => {
    const codes = genererCodesSecours();
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    const empreintes = codes.map(empreinteCode);
    for (const e of empreintes)
      expect(codes.some((c) => e.includes(c.replace('-', '')))).toBe(false); // jamais en clair
    expect(empreinteCode(codes[0])).not.toBe(empreinteCode(codes[0])); // sel aléatoire
    expect(trouverCode(empreintes, codes[3])).toBe(3);
    expect(trouverCode(empreintes, codes[3].toLowerCase().replace('-', ' '))).toBe(3);
    expect(trouverCode(empreintes, 'AAAAA-AAAAA')).toBe(-1);
    expect(trouverCode(empreintes, '123')).toBe(-1);
    expect(trouverCode([], codes[0])).toBe(-1);
  });
});

describe('Double authentification : le parcours complet', () => {
  const prisma = prismaTest();
  let app;
  const chiffreur = chiffreurDepuisEnv();
  beforeAll(() => viderBase(prisma));
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await viderBase(prisma);
    await prisma.administrateur.create({
      data: { email: 'a@test.fr', motDePasseHash: bcrypt.hashSync(MDP, 4), role: 'admin' },
    });
    app = createApp({ prisma });
  });

  const compte = () => prisma.administrateur.findFirstOrThrow();
  const identifiants = { email: 'a@test.fr', motDePasse: MDP };

  /** Active la double authentification et renvoie la clé et les codes de secours. */
  async function activer() {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    const prep = (await agent.post('/api/admin/2fa/preparer').expect(200)).body;
    const secret = prep.secret.replace(/\s/g, '');
    const { codesSecours } = (
      await agent
        .post('/api/admin/2fa/activer')
        .send({ code: codePourPas(secret, pasDeTemps()) })
        .expect(200)
    ).body;
    await agent.post('/api/admin/logout').expect(204);
    await ecoulerLeTemps();
    return { secret, codesSecours };
  }
  const codeCourant = (secret, decalage = 0) => codePourPas(secret, pasDeTemps() + decalage);
  // Un code ne sert qu'une fois : après une connexion, il faut attendre 30 s avant la suivante. On simule ces 30 s.
  const ecoulerLeTemps = () =>
    prisma.administrateur.updateMany({ data: { totpDernierPas: pasDeTemps() - 10 } });

  it('l’activation : clé chiffrée en base, code de vérification exigé, 8 codes de secours donnés une seule fois', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    expect((await agent.get('/api/admin/2fa')).body).toEqual({
      actif: false,
      codesSecoursRestants: 0,
    });
    expect((await agent.get('/api/admin/me')).body.deuxFacteurs).toBe(false);

    const prep = (await agent.post('/api/admin/2fa/preparer').expect(200)).body;
    expect(prep.secret).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/); // lisible, par groupes de 4
    expect(prep.adresse).toMatch(/^otpauth:\/\/totp\//);
    const secret = prep.secret.replace(/\s/g, '');
    const brut = await compte();
    expect(brut.totpSecret).toMatch(/^v1\./); // chiffré
    expect(brut.totpSecret).not.toContain(secret);
    expect(brut.totpActifLe).toBeNull(); // pas encore active : le code n'a pas été vérifié

    // Mauvais code : refusé, rien n'est activé.
    expect((await agent.post('/api/admin/2fa/activer').send({ code: '000000' })).status).toBe(400);
    expect((await compte()).totpActifLe).toBeNull();

    const ok = await agent
      .post('/api/admin/2fa/activer')
      .send({ code: codeCourant(secret) })
      .expect(200);
    expect(ok.body.codesSecours).toHaveLength(8);
    const apres = await compte();
    expect(apres.totpActifLe).not.toBeNull();
    expect(apres.codesSecours).toHaveLength(8);
    for (const c of ok.body.codesSecours)
      expect(JSON.stringify(apres.codesSecours)).not.toContain(c.replace('-', ''));
    expect((await agent.get('/api/admin/2fa')).body).toEqual({
      actif: true,
      codesSecoursRestants: 8,
    });
    expect((await agent.get('/api/admin/me')).body.deuxFacteurs).toBe(true);
    // On ne peut pas la réactiver (ni écraser la clé) tant qu'elle est active.
    expect((await agent.post('/api/admin/2fa/preparer')).status).toBe(409);
    expect(
      (await agent.post('/api/admin/2fa/activer').send({ code: codeCourant(secret) })).status,
    ).toBe(409);
  });

  it('le mot de passe seul ne suffit PLUS : aucune route d’administration n’est accessible avant le code', async () => {
    const { secret } = await activer();
    const agent = request.agent(app);
    const etape1 = await agent.post('/api/admin/login').send(identifiants).expect(200);
    expect(etape1.body).toEqual({ etape: 'code' }); // ni e-mail ni rôle : rien n'est dévoilé
    for (const chemin of [
      '/api/admin/me',
      '/api/admin/messages',
      '/api/admin/avis',
      '/api/admin/sources',
      '/api/admin/2fa',
    ]) {
      expect((await agent.get(chemin)).status, chemin).toBe(401);
    }
    const etape2 = await agent
      .post('/api/admin/login/code')
      .send({ code: codeCourant(secret) })
      .expect(200);
    expect(etape2.body).toMatchObject({ email: 'a@test.fr', role: 'admin' });
    expect((await agent.get('/api/admin/me')).status).toBe(200);
  });

  it('une mauvaise étape 2 est refusée ; sans étape 1 préalable, impossible ; le code ne se rejoue pas', async () => {
    const { secret } = await activer();
    // Étape 2 sans étape 1 : refusée, même avec un code juste.
    expect(
      (
        await request(app)
          .post('/api/admin/login/code')
          .send({ code: codeCourant(secret) })
      ).status,
    ).toBe(401);

    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    expect((await agent.post('/api/admin/login/code').send({ code: '000000' })).status).toBe(401);
    expect((await agent.post('/api/admin/login/code').send({ code: '' })).status).toBe(400);
    const bon = codeCourant(secret);
    await agent.post('/api/admin/login/code').send({ code: bon }).expect(200);
    await agent.post('/api/admin/logout').expect(204);

    // Rejeu : le même code, une minute plus tard dans la même fenêtre, est refusé.
    const pirate = request.agent(app);
    await pirate.post('/api/admin/login').send(identifiants).expect(200);
    expect((await pirate.post('/api/admin/login/code').send({ code: bon })).status).toBe(401);
    // Le code suivant, lui, est accepté.
    await pirate
      .post('/api/admin/login/code')
      .send({ code: codeCourant(secret, 1) })
      .expect(200);
  });

  it('5 codes faux : la tentative est annulée, il faut ressaisir le mot de passe ; le compte se verrouille à la longue', async () => {
    const { secret } = await activer();
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    for (let i = 0; i < 4; i++)
      expect((await agent.post('/api/admin/login/code').send({ code: '111111' })).status).toBe(401);
    const cinquieme = await agent.post('/api/admin/login/code').send({ code: '111111' });
    expect(cinquieme.body.error).toMatch(/recommencez/);
    // La session d'attente a disparu : même le BON code est refusé (401, ou 429 si la limite par adresse IP s'est aussi déclenchée).
    expect([401, 429]).toContain(
      (await agent.post('/api/admin/login/code').send({ code: codeCourant(secret) })).status,
    );
    expect((await agent.get('/api/admin/me')).status).toBe(401);
    expect((await compte()).echecsConsecutifs).toBe(5);

    // Cinq autres échecs (mot de passe ou code) : le compte est verrouillé, même pour le bon mot de passe.
    const autre = createApp({ prisma, trustProxy: '1' });
    for (let i = 0; i < 5; i++) {
      await request(autre)
        .post('/api/admin/login')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .send({ ...identifiants, motDePasse: 'mauvais-mot-de-passe-1' });
    }
    expect((await compte()).verrouilleJusqua).not.toBeNull();
    const verrou = await request(autre)
      .post('/api/admin/login')
      .set('X-Forwarded-For', '198.51.100.99')
      .send(identifiants);
    expect(verrou.status).toBe(429);
  });

  it('l’attente du code expire au bout de 5 minutes', async () => {
    const { secret } = await activer();
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    const ligne = await prisma.sessionAdmin.findFirstOrThrow();
    const donnees = {
      ...ligne.donnees,
      attente2fa: { ...ligne.donnees.attente2fa, le: Date.now() - 6 * 60_000 },
    };
    await prisma.sessionAdmin.update({ where: { sid: ligne.sid }, data: { donnees } });
    expect(
      (await agent.post('/api/admin/login/code').send({ code: codeCourant(secret) })).status,
    ).toBe(401);
  });

  it('un code de secours ouvre la session UNE seule fois, puis il est consommé', async () => {
    const { codesSecours } = await activer();
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    await agent.post('/api/admin/login/code').send({ code: codesSecours[2] }).expect(200);
    expect((await agent.get('/api/admin/2fa')).body.codesSecoursRestants).toBe(7);
    await agent.post('/api/admin/logout').expect(204);

    const reessai = request.agent(app);
    await reessai.post('/api/admin/login').send(identifiants).expect(200);
    expect(
      (await reessai.post('/api/admin/login/code').send({ code: codesSecours[2] })).status,
    ).toBe(401); // déjà utilisé
    await reessai
      .post('/api/admin/login/code')
      .send({ code: codesSecours[5].toLowerCase() })
      .expect(200); // un autre, en minuscules
  });

  it('désactiver exige le mot de passe ET un code ; ensuite le mot de passe seul suffit de nouveau', async () => {
    const { secret } = await activer();
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    await agent
      .post('/api/admin/login/code')
      .send({ code: codeCourant(secret) })
      .expect(200);

    expect(
      (
        await agent
          .post('/api/admin/2fa/desactiver')
          .send({ motDePasse: 'faux-mot-de-passe-xx', code: codeCourant(secret, 1) })
      ).status,
    ).toBe(400);
    expect(
      (await agent.post('/api/admin/2fa/desactiver').send({ motDePasse: MDP, code: '000000' }))
        .status,
    ).toBe(400);
    expect((await compte()).totpActifLe).not.toBeNull(); // rien n'a changé

    await agent
      .post('/api/admin/2fa/desactiver')
      .send({ motDePasse: MDP, code: codeCourant(secret, 1) })
      .expect(200);
    const apres = await compte();
    expect(apres).toMatchObject({ totpSecret: null, totpActifLe: null, codesSecours: [] });
    const simple = await request(app).post('/api/admin/login').send(identifiants);
    expect(simple.body).toMatchObject({ email: 'a@test.fr' });
  });

  it('la clé secrète lue par le serveur correspond à celle donnée à l’utilisateur', async () => {
    const agent = request.agent(app);
    await agent.post('/api/admin/login').send(identifiants).expect(200);
    const prep = (await agent.post('/api/admin/2fa/preparer')).body;
    expect(chiffreur.dechiffrer((await compte()).totpSecret)).toBe(prep.secret.replace(/\s/g, ''));
  });
});
