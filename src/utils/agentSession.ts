export function newAgentSession() {
  const id = crypto.randomUUID();
  try { sessionStorage.setItem('soundisle:agent-session', id); } catch { /* In-memory session still works. */ }
  return id;
}
export function currentAgentSession() {
  try {
    const saved = sessionStorage.getItem('soundisle:agent-session');
    if (saved && /^[a-f0-9-]{36}$/.test(saved)) return saved;
  } catch { /* Storage may be unavailable. */ }
  return newAgentSession();
}
