try {
  process.loadEnvFile();
} catch {
  /* pas de .env : variables du système (CI) */
}
