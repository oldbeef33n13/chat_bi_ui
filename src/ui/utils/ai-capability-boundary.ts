import type { VDoc } from "../../core/doc/types";
import type { CopilotSceneKind, CopilotRouteScene } from "../copilot/copilot-context";

export interface CopilotBoundaryDecision {
  allowed: boolean;
  message?: string;
  recommendations: string[];
}

export interface CopilotBoundarySummary {
  supported: string[];
  unsupported: string[];
  note: string;
}

interface BoundarySceneLike {
  sceneKind?: CopilotSceneKind;
  routeMode?: CopilotRouteScene["routeMode"];
  docType?: VDoc["docType"];
  capabilities?: string[];
}

const TRADITIONAL_OPERATIONS_PATTERN =
  /导出|发布|调度|定时|邮件|通知|权限|审批|接口|api|sql|数据库|数据源|后端|代码|脚本|登录|用户管理/i;

const RUNTIME_ANALYSIS_PATTERN = /下钻|钻取|运行态|继续分析|深度分析|根因|为什么/i;

const PPT_PATTERN = /(ppt|幻灯|幻灯片|页面草稿|汇报页)/i;
const REPORT_PATTERN = /(报告|report|章节草稿|章节大纲)/i;
const DASHBOARD_PATTERN = /(dashboard|大屏|看板|模块草稿|图表模块)/i;

const defaultCapabilitiesByScene = (scene?: BoundarySceneLike): string[] => {
  if (scene?.capabilities?.length) {
    return scene.capabilities;
  }
  switch (scene?.sceneKind) {
    case "dashboard_edit":
      return ["改当前图表", "生成新图表", "调整布局", "生成总结"];
    case "report_edit":
      return ["生成大纲", "生成章节", "重写本章", "插入图表"];
    case "ppt_edit":
      return ["生成页纲", "补下一页", "重写当前页", "优化表达"];
    case "dashboard_runtime":
      return ["解释当前图", "下钻分析", "转成模块草稿", "进入编辑态复用"];
    case "report_runtime":
      return ["总结本章", "全文总结", "继续分析", "保存为章节"];
    case "ppt_runtime":
      return ["当前页总结", "汇报摘要", "继续分析", "转为新页"];
    default:
      return [];
  }
};

export const buildCopilotBoundarySummary = (scene?: BoundarySceneLike): CopilotBoundarySummary => ({
  supported: defaultCapabilitiesByScene(scene),
  unsupported: ["发布/导出", "调度/通知", "数据接口/系统配置", "跨文档类型整单生成"],
  note: "传统能力是主链路，发布、导出、调度、数据接口等操作请直接使用主界面。"
});

const buildSceneLabel = (scene?: BoundarySceneLike): string => {
  switch (scene?.sceneKind) {
    case "dashboard_edit":
      return "Dashboard 编辑";
    case "report_edit":
      return "Report 编辑";
    case "ppt_edit":
      return "PPT 编辑";
    case "dashboard_runtime":
      return "Dashboard 运行态";
    case "report_runtime":
      return "Report 运行态";
    case "ppt_runtime":
      return "PPT 运行态";
    default:
      return "当前场景";
  }
};

const buildUnsupportedMessage = ({
  scene,
  reason,
  recommendations
}: {
  scene?: BoundarySceneLike;
  reason: string;
  recommendations: string[];
}): CopilotBoundaryDecision => ({
  allowed: false,
  recommendations,
  message: `我还在成长中，${buildSceneLabel(scene)}目前不负责${reason}。\n\n你可以先试试：${recommendations.join("、")}。`
});

const hasCrossDocGeneration = (scene: BoundarySceneLike | undefined, input: string): boolean => {
  if (scene?.docType === "report") {
    return PPT_PATTERN.test(input) || DASHBOARD_PATTERN.test(input);
  }
  if (scene?.docType === "ppt") {
    return REPORT_PATTERN.test(input) || DASHBOARD_PATTERN.test(input);
  }
  if (scene?.docType === "dashboard") {
    return PPT_PATTERN.test(input) || REPORT_PATTERN.test(input);
  }
  return false;
};

export const guardCopilotEditRequest = (scene: BoundarySceneLike | undefined, input: string): CopilotBoundaryDecision => {
  const text = input.trim();
  const recommendations = defaultCapabilitiesByScene(scene).slice(0, 3);
  if (!text) {
    return { allowed: true, recommendations };
  }
  if (TRADITIONAL_OPERATIONS_PATTERN.test(text)) {
    return buildUnsupportedMessage({
      scene,
      reason: "发布、导出、调度、数据接口或系统配置这类传统操作",
      recommendations: recommendations.length > 0 ? recommendations : ["直接使用主界面的传统功能"]
    });
  }
  if (scene?.routeMode === "edit" && RUNTIME_ANALYSIS_PATTERN.test(text)) {
    return buildUnsupportedMessage({
      scene,
      reason: "运行态分析和下钻",
      recommendations: ["切到运行态后再做解释当前图", "在运行态继续下钻分析", "把运行结论再转回编辑态"]
    });
  }
  if (hasCrossDocGeneration(scene, text)) {
    return buildUnsupportedMessage({
      scene,
      reason: "跨文档类型生成",
      recommendations: recommendations.length > 0 ? recommendations : ["在当前文档类型里继续生成和修改"]
    });
  }
  return { allowed: true, recommendations };
};

export const guardCopilotGenerationRequest = (scene: BoundarySceneLike | undefined, input: string): CopilotBoundaryDecision => {
  const text = input.trim();
  const recommendations = defaultCapabilitiesByScene(scene).slice(0, 3);
  if (!text) {
    return { allowed: true, recommendations };
  }
  if (TRADITIONAL_OPERATIONS_PATTERN.test(text)) {
    return buildUnsupportedMessage({
      scene,
      reason: "发布、导出、调度、数据接口或系统配置这类传统操作",
      recommendations: recommendations.length > 0 ? recommendations : ["直接使用主界面的传统功能"]
    });
  }
  if (hasCrossDocGeneration(scene, text)) {
    return buildUnsupportedMessage({
      scene,
      reason: "跨文档类型整单生成",
      recommendations: recommendations.length > 0 ? recommendations : ["在当前文档类型里继续生成内容"]
    });
  }
  return { allowed: true, recommendations };
};
