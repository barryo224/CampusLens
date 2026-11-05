const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const euroCentimes = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 3240 → « 3 240 € » */
export const formaterEuro = (n) => euro.format(n);
/** 23.58 → « 23,58 € » */
export const formaterEuroCentimes = (n) => euroCentimes.format(n);

/** Date ISO → « 5 novembre 2026 » */
export function formaterDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Date et heure : « 5 novembre 2026 à 14:03 ». */
export function formaterDateHeure(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
