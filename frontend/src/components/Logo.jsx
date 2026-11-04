export default function Logo({ taille = 40 }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="11" fill="#fff" />
      <circle cx="18" cy="18" r="8" fill="none" stroke="#0f4c5a" strokeWidth="3" />
      <circle cx="18" cy="18" r="3" fill="#f59e0b" />
      <path d="M24 24l7 7" stroke="#0f4c5a" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
