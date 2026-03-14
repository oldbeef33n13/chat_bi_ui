import { useMemo } from "react";
import type { TemplateSeed } from "../api/template-repository";
import type { BlankTemplateOption } from "./shared";
import { groupSeedTemplates } from "./shared";

export function CreateTemplatePanel({
  blankOptions,
  seeds,
  seedsLoading,
  seedsError,
  onRetrySeeds,
  onCreateBlank,
  onCreateFromSeed
}: {
  blankOptions: BlankTemplateOption[];
  seeds: TemplateSeed[];
  seedsLoading: boolean;
  seedsError?: string;
  onRetrySeeds: () => void;
  onCreateBlank: (option: BlankTemplateOption) => void;
  onCreateFromSeed: (seed: TemplateSeed) => void;
}): JSX.Element {
  const groupedSeeds = useMemo(() => groupSeedTemplates(seeds), [seeds]);

  return (
    <div className="toolbar-pop create-template-pop">
      <div className="toolbar-pop-title">空白创建</div>
      <div className="create-template-grid">
        {blankOptions.map((option) => (
          <button key={option.id} className="create-template-card" onClick={() => onCreateBlank(option)}>
            <span className="create-template-icon">{option.icon}</span>
            <span className="create-template-name">{option.label}</span>
            <span className="create-template-desc">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-pop-title">从示例创建</div>
      {seedsLoading ? <div className="create-template-empty">正在加载示例模板...</div> : null}
      {seedsError ? (
        <div className="create-template-empty">
          <span>{seedsError}</span>
          <button className="btn" onClick={onRetrySeeds}>
            重试
          </button>
        </div>
      ) : null}
      {!seedsLoading && !seedsError ? (
        groupedSeeds.length > 0 ? (
          <div className="create-template-groups">
            {groupedSeeds.map((group) => (
              <div key={group.docType} className="create-template-group">
                <div className="create-template-group-title">{group.label}</div>
                <div className="create-template-grid create-template-grid-seed">
                  {group.items.map((seed) => (
                    <button key={seed.id} className="create-template-card create-template-card-seed" onClick={() => onCreateFromSeed(seed)}>
                      <span className="create-template-name">{seed.name}</span>
                      <span className="create-template-desc">{seed.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="create-template-empty">当前没有可用示例模板。</div>
        )
      ) : null}
    </div>
  );
}
