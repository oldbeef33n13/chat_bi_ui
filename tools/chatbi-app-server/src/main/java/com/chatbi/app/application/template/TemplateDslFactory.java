package com.chatbi.app.application.template;

import com.chatbi.app.api.template.CreateTemplateRequest;
import com.chatbi.app.domain.template.TemplateType;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class TemplateDslFactory {

  private final DashboardTemplateSeedFactory dashboardSeeds;
  private final ReportTemplateSeedFactory reportSeeds;
  private final PptTemplateSeedFactory pptSeeds;
  private final List<TemplateSeedDefinition> seedDefinitions;

  public TemplateDslFactory(
    DashboardTemplateSeedFactory dashboardSeeds,
    ReportTemplateSeedFactory reportSeeds,
    PptTemplateSeedFactory pptSeeds
  ) {
    this.dashboardSeeds = dashboardSeeds;
    this.reportSeeds = reportSeeds;
    this.pptSeeds = pptSeeds;
    this.seedDefinitions = List.of(
      new TemplateSeedDefinition(
        "template-dashboard-overview",
        TemplateType.DASHBOARD,
        "网络运维总览",
        "覆盖告警趋势、容量压力和待处置事件的运维总览大屏",
        List.of("dashboard", "seed", "ops", "overview")
      ),
      new TemplateSeedDefinition(
        "template-dashboard-workbench",
        TemplateType.DASHBOARD,
        "网络运维工作台",
        "适合 PC 首页与值班场景的页面滚动工作台",
        List.of("dashboard", "seed", "ops", "workbench")
      ),
      new TemplateSeedDefinition(
        "template-dashboard-command-center",
        TemplateType.DASHBOARD,
        "运维指挥中心",
        "覆盖链路质量、资源压力与故障追踪的综合大屏",
        List.of("dashboard", "seed", "ops", "command")
      ),
      new TemplateSeedDefinition(
        "template-dashboard-chart-gallery",
        TemplateType.DASHBOARD,
        "图表能力样例",
        "覆盖 line、combo、pie、scatter、radar、treemap、gauge、heatmap、funnel、sankey 的图表画廊",
        List.of("dashboard", "seed", "chart", "gallery")
      ),
      new TemplateSeedDefinition(
        "template-report-weekly",
        TemplateType.REPORT,
        "网络周报",
        "包含趋势、容量和工单摘要的标准周报模板",
        List.of("report", "seed", "ops", "weekly")
      ),
      new TemplateSeedDefinition(
        "template-report-incident-review",
        TemplateType.REPORT,
        "重点事件复盘",
        "用于故障复盘与影响面分析的报告模板",
        List.of("report", "seed", "incident", "review")
      ),
      new TemplateSeedDefinition(
        "template-ppt-review",
        TemplateType.PPT,
        "网络运营汇报",
        "适合周会例会的双页汇报模板",
        List.of("ppt", "seed", "ops", "review")
      ),
      new TemplateSeedDefinition(
        "template-ppt-exec-briefing",
        TemplateType.PPT,
        "高层经营简报",
        "适合管理层查看的经营与健康汇报模板",
        List.of("ppt", "seed", "exec", "briefing")
      )
    );
  }

  public List<TemplateSeedDefinition> seedDefinitions() {
    return seedDefinitions;
  }

  public JsonNode createDefaultDsl(String templateId, CreateTemplateRequest request) {
    String seedTemplateId = blankOrNull(request.seedTemplateId());
    if (seedTemplateId != null && findSeedDefinition(seedTemplateId).isPresent()) {
      return createSeedDsl(templateId, seedTemplateId, request.name());
    }
    return switch (request.templateType()) {
      case DASHBOARD -> dashboardSeeds.createDefaultDsl(
        templateId,
        request.name(),
        "workbench".equalsIgnoreCase(request.dashboardPreset()) ? "workbench" : "wallboard"
      );
      case REPORT -> reportSeeds.createDefaultDsl(templateId, request.name());
      case PPT -> pptSeeds.createDefaultDsl(templateId, request.name());
    };
  }

  public JsonNode createSeedDsl(String templateId, String seedTemplateId, String overrideName) {
    String displayName = blankToDefault(
      overrideName,
      findSeedDefinition(seedTemplateId).map(TemplateSeedDefinition::name).orElse("示例模板")
    );
    return switch (seedTemplateId) {
      case "template-dashboard-overview" -> dashboardSeeds.createOverviewSeed(templateId, displayName);
      case "template-dashboard-workbench" -> dashboardSeeds.createWorkbenchSeed(templateId, displayName);
      case "template-dashboard-command-center" -> dashboardSeeds.createCommandCenterSeed(templateId, displayName);
      case "template-dashboard-chart-gallery" -> dashboardSeeds.createChartGallerySeed(templateId, displayName);
      case "template-report-weekly" -> reportSeeds.createWeeklySeed(templateId, displayName);
      case "template-report-incident-review" -> reportSeeds.createIncidentReviewSeed(templateId, displayName);
      case "template-ppt-review" -> pptSeeds.createReviewSeed(templateId, displayName);
      case "template-ppt-exec-briefing" -> pptSeeds.createExecutiveSeed(templateId, displayName);
      default -> dashboardSeeds.createDefaultDsl(templateId, displayName, "wallboard");
    };
  }

  private Optional<TemplateSeedDefinition> findSeedDefinition(String seedTemplateId) {
    return seedDefinitions.stream().filter(item -> item.id().equals(seedTemplateId)).findFirst();
  }

  private String blankOrNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private String blankToDefault(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value.trim();
  }
}
