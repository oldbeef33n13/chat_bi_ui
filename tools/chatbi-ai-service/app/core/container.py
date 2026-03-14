from __future__ import annotations

from app.core.llm.openai_compatible import OpenAiCompatibleClient
from app.orchestration import ConversationRouter, EditOrchestrationService, GenerationOrchestrationService, ObjectRegistryBuilder, OrchestrationStore, RuntimeOrchestrationService
from app.orchestration.java_gateway import JavaAppGateway
from app.core.prompt_registry import PromptRegistry
from app.core.settings import settings
from app.scenes.chart_ask.service import ChartAskScene
from app.scenes.chart_recommend.service import ChartRecommendScene
from app.scenes.command_plan.service import CommandPlanScene
from app.scenes.data_guide.service import DataGuideScene
from app.scenes.story_summary.service import StorySummaryScene


class ServiceContainer:
  def __init__(self) -> None:
    self.settings = settings
    self.prompts = PromptRegistry()
    self.orchestration_store = OrchestrationStore(settings.orchestration_db_path)
    self.object_registry_builder = ObjectRegistryBuilder()
    self.java_gateway = JavaAppGateway(settings.app_server_base_url, settings.request_timeout_seconds)
    self.llm = (
      OpenAiCompatibleClient(
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
        model=settings.openai_model,
        timeout_seconds=settings.request_timeout_seconds,
      )
      if settings.resolved_provider == "openai_compatible" and settings.openai_base_url and settings.openai_api_key
      else None
    )
    self.command_plan = CommandPlanScene(self.llm, self.prompts)
    self.chart_recommend = ChartRecommendScene(self.llm, self.prompts)
    self.chart_ask = ChartAskScene(self.llm, self.prompts)
    self.data_guide = DataGuideScene(self.llm, self.prompts)
    self.story_summary = StorySummaryScene(self.llm, self.prompts)
    self.conversation_router = ConversationRouter(self.orchestration_store)
    self.edit_orchestration = EditOrchestrationService(
      store=self.orchestration_store,
      object_registry_builder=self.object_registry_builder,
      router=self.conversation_router,
      command_plan_scene=self.command_plan,
    )
    self.generation_orchestration = GenerationOrchestrationService(self.orchestration_store)
    self.runtime_orchestration = RuntimeOrchestrationService()


container = ServiceContainer()
