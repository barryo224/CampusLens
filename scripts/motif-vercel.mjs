// Traduit un « source » de vercel.json (syntaxe path-to-regexp) en expression régulière, pour la simulation de production
// et ses tests. Syntaxes prises en charge : « (.*) », « :nom(a|b|c) » et « /:nom* ».
export function motifDeSource(source) {
  const regex = source
    .replace(/\/:[A-Za-z_]+\*/g, '(?:/.*)?') // « /admin/:chemin* » : « /admin » et tout ce qui suit
    .replace(/:[A-Za-z_]+\(([^)]*)\)/g, '($1)') // « :page(a|b) » : un des choix
    .replace(/\(\.\*\)/g, '.*'); // « (.*) » : n'importe quoi
  return new RegExp(`^${regex}$`);
}
