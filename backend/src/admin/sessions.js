import session from 'express-session';

/**
 * Stockage des sessions admin dans PostgreSQL (via Prisma) : elles survivent à un
 * redémarrage du serveur et fonctionnent avec plusieurs instances.
 */
export class StockageSessions extends session.Store {
  constructor(prisma, { dureeMs = 2 * 60 * 60 * 1000 } = {}) {
    super();
    this.prisma = prisma;
    this.dureeMs = dureeMs;
  }

  #expiration(sess) {
    const e = sess?.cookie?.expires;
    return e ? new Date(e) : new Date(Date.now() + this.dureeMs);
  }

  get(sid, cb) {
    this.prisma.sessionAdmin
      .findUnique({ where: { sid } })
      .then((ligne) => {
        if (!ligne || ligne.expire <= new Date()) return cb(null, null);
        cb(null, ligne.donnees);
      })
      .catch(cb);
  }

  set(sid, sess, cb) {
    const donnees = JSON.parse(JSON.stringify(sess));
    this.prisma.sessionAdmin
      .upsert({
        where: { sid },
        update: { donnees, expire: this.#expiration(sess) },
        create: { sid, donnees, expire: this.#expiration(sess) },
      })
      .then(() => cb?.(null))
      .catch((e) => cb?.(e));
  }

  touch(sid, sess, cb) {
    this.prisma.sessionAdmin
      .updateMany({ where: { sid }, data: { expire: this.#expiration(sess) } })
      .then(() => cb?.(null))
      .catch((e) => cb?.(e));
  }

  destroy(sid, cb) {
    this.prisma.sessionAdmin
      .deleteMany({ where: { sid } })
      .then(() => cb?.(null))
      .catch((e) => cb?.(e));
  }
}
