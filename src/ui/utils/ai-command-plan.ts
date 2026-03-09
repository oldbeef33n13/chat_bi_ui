import type { CommandPlan, VNode } from "../../core/doc/types";

type PlanRootLike = Pick<VNode, "id" | "kind"> & { children?: PlanRootLike[] };

/**
 * 轻量规则推断：将自然语言转为 CommandPlan。
 * 作为本地兜底能力，确保 AI 通道在离线/无模型时仍可演示与联调。
 */
export const inferCommandPlan = (input: string, currentNodeId?: string, root?: PlanRootLike): CommandPlan => {
  const nodeId = currentNodeId ?? "node_123";
  const commands: CommandPlan["commands"] = [];

  if (/折线|line/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { chartType: "line" } });
  }
  if (/柱状|bar/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { chartType: "bar" } });
  }
  if (/饼图|pie/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { chartType: "pie" } });
  }
  if (/平滑|smooth/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { smooth: true } });
  }
  if (/标签|label/i.test(input)) {
    commands.push({ type: "UpdateProps", nodeId, props: { labelShow: true } });
  }
  if (/暗色|dark/i.test(input)) {
    commands.push({ type: "ApplyTheme", scope: "doc", themeId: "theme.tech.dark" });
  }
  if (/所有图表.*标签|全部图表.*标签/i.test(input)) {
    const chartIds = collectChartIds(root);
    commands.push({
      type: "Transaction",
      commands: (chartIds.length > 0 ? chartIds : [nodeId]).map((id) => ({ type: "UpdateProps", nodeId: id, props: { labelShow: true } }))
    });
  }

  // 没识别出意图时给一个保守默认，避免空计划导致预览链路断开。
  if (commands.length === 0) {
    commands.push({ type: "UpdateProps", nodeId, props: { smooth: true } });
  }

  return {
    intent: "update",
    targets: [nodeId],
    commands,
    explain: input
  };
};

/**
 * 统一的命令解释文案，用于 AI 面板和轻量浮层。
 */
export const explainPlan = (plan: CommandPlan): string => {
  const lines: string[] = [];
  lines.push(`意图: ${plan.intent}`);
  if (plan.explain) {
    lines.push(`描述: ${plan.explain}`);
  }
  lines.push(`命令数: ${plan.commands.length}`);
  plan.commands.forEach((command, index) => {
    const i = index + 1;
    if (command.type === "UpdateProps") {
      lines.push(`${i}. UpdateProps -> node=${command.nodeId ?? "-"} fields=${Object.keys(command.props ?? {}).join(", ") || "-"}`);
      return;
    }
    if (command.type === "UpdateLayout") {
      lines.push(`${i}. UpdateLayout -> node=${command.nodeId ?? "-"} fields=${Object.keys(command.layout ?? {}).join(", ") || "-"}`);
      return;
    }
    if (command.type === "UpdateStyle") {
      lines.push(`${i}. UpdateStyle -> node=${command.nodeId ?? "-"} fields=${Object.keys(command.style ?? {}).join(", ") || "-"}`);
      return;
    }
    if (command.type === "ApplyTheme") {
      lines.push(`${i}. ApplyTheme -> scope=${typeof command.scope === "string" ? command.scope : command.scope?.nodeId ?? "doc"} theme=${command.themeId ?? "-"}`);
      return;
    }
    if (command.type === "Transaction") {
      lines.push(`${i}. Transaction -> 子命令 ${command.commands?.length ?? 0} 条`);
      return;
    }
    lines.push(`${i}. ${command.type}`);
  });
  return lines.join("\n");
};

const collectChartIds = (root?: PlanRootLike): string[] => {
  if (!root) {
    return [];
  }
  const ids: string[] = [];
  const walk = (node: PlanRootLike): void => {
    if (node.kind === "chart") {
      ids.push(node.id);
    }
    node.children?.forEach((child) => walk(child));
  };
  walk(root);
  return ids;
};
