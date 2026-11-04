import { createApp } from './app.js';
import { creerPrisma } from './db.js';

const port = Number(process.env.PORT) || 3001;

createApp({ prisma: creerPrisma() }).listen(port, () => {
  console.log(`API CampusLens sur http://localhost:${port}`);
});
