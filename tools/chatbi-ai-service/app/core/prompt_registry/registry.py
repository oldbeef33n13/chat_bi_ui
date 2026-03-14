from __future__ import annotations

from importlib.resources import files

from app.core.prompt_registry.models import PromptDefinition, ScenePromptCatalog


class PromptRegistry:
  def __init__(self) -> None:
    self._catalog_cache: dict[str, ScenePromptCatalog] = {}

  def list_scenes(self) -> list[str]:
    resource_dir = files("app.core.prompt_registry.scenes")
    return sorted(item.name[:-5] for item in resource_dir.iterdir() if item.is_file() and item.name.endswith(".json"))

  def get_active_versions(self) -> dict[str, str]:
    return {scene: self.get_active_version(scene) for scene in self.list_scenes()}

  def list_versions(self, scene: str) -> list[str]:
    return sorted(self._load_catalog(scene).versions.keys())

  def get_active_version(self, scene: str) -> str:
    return self._load_catalog(scene).activeVersion

  def resolve_version(self, scene: str, version: str | None = None) -> str:
    return version or self.get_active_version(scene)

  def get_prompt(self, scene: str, version: str | None = None) -> PromptDefinition:
    catalog = self._load_catalog(scene)
    target_version = version or catalog.activeVersion
    record = catalog.versions.get(target_version)
    if not record:
      raise KeyError(f"unknown prompt version '{target_version}' for scene '{scene}'")
    return PromptDefinition(
      scene=catalog.scene,
      version=target_version,
      status=record.status,
      goal=record.goal,
      systemPrompt=record.systemPrompt,
      outputContract=record.outputContract,
      notes=record.notes,
      updatedAt=record.updatedAt,
    )

  def _load_catalog(self, scene: str) -> ScenePromptCatalog:
    cached = self._catalog_cache.get(scene)
    if cached:
      return cached
    resource = files("app.core.prompt_registry.scenes").joinpath(f"{scene}.json")
    if not resource.is_file():
      raise KeyError(f"unknown prompt scene '{scene}'")
    catalog = ScenePromptCatalog.model_validate_json(resource.read_text(encoding="utf-8"))
    if catalog.scene != scene:
      raise ValueError(f"prompt catalog scene mismatch: expected '{scene}', got '{catalog.scene}'")
    if catalog.activeVersion not in catalog.versions:
      raise ValueError(f"prompt catalog '{scene}' activeVersion '{catalog.activeVersion}' is undefined")
    self._catalog_cache[scene] = catalog
    return catalog
