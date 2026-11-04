import { positionJauge } from '../lib/jauge.js';

const CX = 130;
const CY = 125;
const R = 100;

// Point sur le demi-cercle : t = 0 (gauche) → 180 (droite), en passant par le haut.
const point = (t, rayon = R) => {
  const a = (t * Math.PI) / 180;
  return [CX - rayon * Math.cos(a), CY - rayon * Math.sin(a)];
};
const arc = (t1, t2) => {
  const [x1, y1] = point(t1);
  const [x2, y2] = point(t2);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

/** Jauge en demi-cercle : rouge (en difficulté) · orange (fragile) · vert (équilibré). */
export default function Jauge({ resteAVivre, seuilFragile, libelle }) {
  const angle = positionJauge(resteAVivre, seuilFragile) * 180;
  const [bx, by] = point(angle, 78);
  return (
    <svg viewBox="0 0 260 150" className="jauge" role="img" aria-label={libelle}>
      <path d={arc(2, 58)} stroke="#e5484d" strokeWidth="22" fill="none" />
      <path d={arc(62, 118)} stroke="#f59e0b" strokeWidth="22" fill="none" />
      <path d={arc(122, 178)} stroke="#2a9d6a" strokeWidth="22" fill="none" />
      <line
        data-testid="aiguille"
        data-angle={angle.toFixed(1)}
        x1={CX}
        y1={CY}
        x2={bx}
        y2={by}
        stroke="#10242b"
        strokeWidth="5"
        strokeLinecap="round"
        style={{ transition: 'all .3s ease' }}
      />
      <circle cx={CX} cy={CY} r="9" fill="#10242b" />
    </svg>
  );
}
