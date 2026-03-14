export const MAX_COPILOT_CHAT_MESSAGES = 80;

export interface CopilotChatMessageBase {
  role: "assistant" | "user";
}

export const trimCopilotChatMessages = <T extends CopilotChatMessageBase>(messages: T[]): T[] => {
  if (messages.length <= MAX_COPILOT_CHAT_MESSAGES) {
    return messages;
  }
  const intro = messages[0]?.role === "assistant" ? messages[0] : null;
  const tailBudget = intro ? MAX_COPILOT_CHAT_MESSAGES - 1 : MAX_COPILOT_CHAT_MESSAGES;
  const tail = messages.slice(-tailBudget);
  return intro ? [intro, ...tail] : tail;
};

export const appendCopilotChatMessages = <T extends CopilotChatMessageBase>(current: T[], ...next: T[]): T[] =>
  trimCopilotChatMessages([...current, ...next]);
