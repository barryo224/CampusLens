import { robotLoyers } from './loyers.js';
import { robotLogementsCrous } from './logementsCrous.js';
import { robotDroits, robotCvec } from './pagesOfficielles.js';
import { robotLiensRessources } from './liensRessources.js';
import { robotOpenfisca } from './openfisca.js';

/** Tous les robots, par identifiant de source (source.cle). */
export const ROBOTS = {
  loyers: robotLoyers,
  logements_crous: robotLogementsCrous,
  droits: robotDroits,
  cvec: robotCvec,
  liens_ressources: robotLiensRessources,
  openfisca: robotOpenfisca,
};
