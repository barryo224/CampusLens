import { describe, it, expect } from 'vitest';
import { formaterDate, formaterDateHeure } from '../src/lib/format.js';

describe('Dates en français correct', () => {
  it('le premier jour du mois s’écrit « 1er », pas « 1 »', () => {
    expect(formaterDate('2026-11-01T10:30:00Z')).toBe('1er novembre 2026');
    expect(formaterDate('2026-12-01T12:00:00Z')).toBe('1er décembre 2026');
    expect(formaterDateHeure('2026-11-01T10:30:00Z')).toMatch(/^1er novembre 2026 à \d{2}:\d{2}$/);
  });
  it('les autres jours ne changent pas (dont le 11, le 21 et le 31)', () => {
    expect(formaterDate('2026-11-05T12:00:00Z')).toBe('5 novembre 2026');
    expect(formaterDate('2026-11-11T12:00:00Z')).toBe('11 novembre 2026');
    expect(formaterDate('2026-10-21T12:00:00Z')).toBe('21 octobre 2026');
    expect(formaterDate('2026-10-31T12:00:00Z')).toBe('31 octobre 2026');
  });
  it('une date absente donne un texte vide (ou un tiret avec l’heure)', () => {
    expect(formaterDate(null)).toBe('');
    expect(formaterDateHeure(null)).toBe('—');
  });
});
