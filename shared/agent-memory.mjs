export const MEMORY_LIMITS = Object.freeze({ messages: 24, characters: 12000, messageCharacters: 4000, longTermCharacters: 2000 });
export function boundedHistory(value) {
  const messages = Array.isArray(value) ? value.filter(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string').slice(-MEMORY_LIMITS.messages).map(m => ({
    role: m.role, content: m.content.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, MEMORY_LIMITS.messageCharacters),
  })) : [];
  while (messages.reduce((n, m) => n + m.content.length, 0) > MEMORY_LIMITS.characters) messages.shift();
  // Never start a model conversation with an orphaned assistant reply.
  while (messages[0]?.role === 'assistant') messages.shift();
  return messages;
}
