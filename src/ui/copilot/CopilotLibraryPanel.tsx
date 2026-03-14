import { useEffect, useMemo, useRef, useState } from "react";
import type { TemplateMeta } from "../api/template-repository";
import { appendCopilotChatMessages, trimCopilotChatMessages } from "./chat-history";

type ChatRole = "assistant" | "user";
type ChatTone = "neutral" | "error";

interface TemplateSearchMessage {
  id: string;
  role: ChatRole;
  tone: ChatTone;
  text: string;
  matches?: TemplateMeta[];
}

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
}

const createMessage = (
  role: ChatRole,
  text: string,
  options: { tone?: ChatTone; matches?: TemplateMeta[] } = {}
): TemplateSearchMessage => ({
  id: `${role}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  role,
  tone: options.tone ?? "neutral",
  text,
  matches: options.matches
});

const quickActions: QuickAction[] = [
  { id: "library-report", label: "找周报模板", prompt: "我要编辑周报模板" },
  { id: "library-dashboard", label: "找 dashboard 模板", prompt: "我要编辑 dashboard 模板" },
  { id: "library-ppt", label: "找汇报PPT", prompt: "我要编辑汇报 PPT 模板" }
];

const toEditHash = (docId: string): string => `#/docs/${encodeURIComponent(docId)}/edit`;

const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, "");

const extractTemplateQuery = (prompt: string): string =>
  prompt
    .replace(/[“”"'`]/g, " ")
    .replace(/我要|帮我|想要|打开|进入|查找|查询|搜索|编辑|模板|文档|一下|一个|一份/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreTemplate = (template: TemplateMeta, query: string): number => {
  if (!query) {
    return 1;
  }
  const normalizedQuery = normalize(query);
  const name = normalize(template.name);
  const description = normalize(template.description);
  const tags = template.tags.map(normalize).join(" ");
  const docType = normalize(template.docType);
  let score = 0;
  if (name.includes(normalizedQuery)) {
    score += 8;
  }
  if (description.includes(normalizedQuery)) {
    score += 4;
  }
  if (tags.includes(normalizedQuery)) {
    score += 3;
  }
  if (docType.includes(normalizedQuery)) {
    score += 2;
  }
  return score;
};

const searchTemplates = (templates: TemplateMeta[], prompt: string): TemplateMeta[] => {
  const query = extractTemplateQuery(prompt);
  const ranked = templates
    .map((template) => ({
      template,
      score: scoreTemplate(template, query)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.template.updatedAt.localeCompare(left.template.updatedAt);
    })
    .map((item) => item.template);
  if (ranked.length > 0) {
    return ranked.slice(0, 5);
  }
  return templates
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5);
};

export function CopilotLibraryPanel({ templates }: { templates: TemplateMeta[] }): JSX.Element {
  const [input, setInput] = useState("我要编辑周报模板");
  const [messages, setMessages] = useState<TemplateSearchMessage[]>([]);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const templateCount = templates.length;

  useEffect(() => {
    setMessages(trimCopilotChatMessages([
      createMessage("assistant", `直接告诉我你想编辑哪个模板。我会先列出匹配结果，你点一下就能进入编辑。`)
    ]));
  }, [templateCount]);

  const topTemplates = useMemo(
    () =>
      templates
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 5),
    [templates]
  );

  useEffect(() => {
    const container = feedRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const runSearch = (promptOverride?: string): void => {
    const nextPrompt = (promptOverride ?? input).trim();
    if (!nextPrompt) {
      return;
    }
    setInput(nextPrompt);
    const matches = searchTemplates(templates, nextPrompt);
    setMessages((current) =>
      appendCopilotChatMessages(
        current,
        createMessage("user", nextPrompt),
        createMessage(
          "assistant",
          matches.length > 0
            ? `我先帮你找到这些匹配模板，直接点“进入编辑”就行。`
            : "我还没找到特别贴近的模板，先给你列出最近可编辑的模板。",
          { matches: matches.length > 0 ? matches : topTemplates, tone: matches.length > 0 ? "neutral" : "error" }
        )
      )
    );
  };

  const handleQuickAction = (action: QuickAction): void => {
    setInput(action.prompt);
    runSearch(action.prompt);
  };

  const handleSubmit = (): void => {
    runSearch();
  };

  return (
    <div className="copilot-chat">
      <div ref={feedRef} className="copilot-chat-feed" data-testid="copilot-library-feed">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`copilot-chat-message ${message.role === "user" ? "is-user" : "is-assistant"} ${
              message.tone === "error" ? "is-error" : ""
            }`}
          >
            <div className="copilot-chat-message-label">{message.role === "user" ? "你" : "Copilot"}</div>
            <div className="copilot-chat-bubble">
              <span>{message.text}</span>
              {message.matches?.length ? (
                <div className="copilot-inline-card-list">
                  {message.matches.map((item) => (
                    <div key={item.id} className="copilot-inline-card copilot-template-card">
                      <div className="copilot-inline-card-header">
                        <strong>{item.name}</strong>
                        <span className="chip">{item.docType}</span>
                      </div>
                      <span className="muted">{item.description || "暂无模板描述"}</span>
                      <div className="copilot-template-card-meta">
                        <span>更新时间 {item.updatedAt.slice(0, 10)}</span>
                        <span>{item.tags.slice(0, 3).join(" · ") || "无标签"}</span>
                      </div>
                      <div className="copilot-inline-card-actions">
                        <button
                          className="btn primary"
                          disabled={item.canEdit === false}
                          onClick={() => {
                            window.location.hash = toEditHash(item.id);
                          }}
                        >
                          {item.canEdit === false ? "无编辑权限" : "进入编辑"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="copilot-chat-composer">
        <div className="copilot-chat-quick-actions">
          {quickActions.map((action) => (
            <button key={action.id} className="btn mini-btn" onClick={() => handleQuickAction(action)}>
              {action.label}
            </button>
          ))}
        </div>
        <div className="copilot-chat-input-row">
          <input
            aria-label="Copilot 输入"
            className="input"
            placeholder="例如：我要编辑经营周报模板"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button className="btn primary" onClick={handleSubmit}>
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
