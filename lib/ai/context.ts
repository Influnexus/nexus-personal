// Long-conversation stability: once a thread grows large, compact older turns into a
// compact summary (preserving concrete financial facts) instead of sending unbounded
// history to the LLM on every turn. Keeps the app fast, cheap and within context limits
// even for 1000+ message conversations. Full structured "Business Memory" (cross-session
// facts) is layered on top of this in a later phase — this handles in-thread stability.
import { ChatMessage, llm } from './provider';

const MAX_MESSAGES_BEFORE_SUMMARY = 24; // ~12 user/assistant turns
const KEEP_RECENT = 12;

export async function compactMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  if (messages.length <= MAX_MESSAGES_BEFORE_SUMMARY) return messages;

  const older = messages.slice(0, messages.length - KEEP_RECENT);
  const recent = messages.slice(messages.length - KEEP_RECENT);
  const olderText = older
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : ''}`)
    .filter(Boolean)
    .join('\n')
    .slice(0, 24000);

  if (!olderText) return recent;

  try {
    const res = await llm.complete({
      messages: [
        {
          role: 'system',
          content: 'Summarize this earlier portion of a CFO/finance conversation into a compact briefing for context continuity. '
            + 'Preserve concrete facts: specific dollar amounts, dates, vendor/invoice names, financial decisions made, reports or forecasts discussed, and business goals stated. '
            + 'Be terse (bullet points), do not lose numbers or names.',
        },
        { role: 'user', content: olderText },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });
    const summary = res.content || 'Earlier discussion covered general financial questions.';
    return [
      { role: 'system', content: `[Summary of earlier conversation — ${older.length} messages compacted]\n${summary}` },
      ...recent,
    ];
  } catch {
    // If summarization itself fails, hard-truncate rather than blow up the request — never let
    // a long conversation break the chat.
    return recent;
  }
}
