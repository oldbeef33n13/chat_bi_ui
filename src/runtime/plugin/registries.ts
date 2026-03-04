import type { Command, VNode } from "../../core/doc/types";
import type { NodeRenderer } from "../renderer/registry";

/** 节点类型定义注册器（可用于插件化新增节点种类）。 */
export interface NodeTypeDef {
  kind: string;
  defaults: () => VNode;
  validate?: (node: VNode) => string[];
}

export class NodeTypeRegistry {
  private readonly map = new Map<string, NodeTypeDef>();

  register(def: NodeTypeDef): void {
    this.map.set(def.kind, def);
  }

  get(kind: string): NodeTypeDef | undefined {
    return this.map.get(kind);
  }

  list(): NodeTypeDef[] {
    return [...this.map.values()];
  }
}

/** 渲染器注册器的轻量适配层。 */
export class RendererRegistryAdapter {
  private readonly map = new Map<string, NodeRenderer>();

  register(kind: string, renderer: NodeRenderer): void {
    this.map.set(kind, renderer);
  }

  get(kind: string): NodeRenderer | undefined {
    return this.map.get(kind);
  }
}

export type InspectorFactory = (node: VNode) => JSX.Element | null;

/** 属性面板工厂注册器。 */
export class InspectorRegistry {
  private readonly map = new Map<string, InspectorFactory>();

  register(kind: string, inspector: InspectorFactory): void {
    this.map.set(kind, inspector);
  }

  create(kind: string, node: VNode): JSX.Element | null {
    return this.map.get(kind)?.(node) ?? null;
  }
}

export type CommandHandler = (command: Command) => boolean;

/** 命令处理器注册器（便于扩展自定义命令）。 */
export class CommandRegistry {
  private readonly map = new Map<Command["type"], CommandHandler>();

  register(type: Command["type"], handler: CommandHandler): void {
    this.map.set(type, handler);
  }

  run(command: Command): boolean {
    const handler = this.map.get(command.type);
    if (!handler) {
      return false;
    }
    return handler(command);
  }
}

export interface TemplateItem {
  id: string;
  target: string;
  nodes: VNode[];
}

/** 模板仓库注册器。 */
export class TemplateRegistry {
  private readonly map = new Map<string, TemplateItem>();

  register(item: TemplateItem): void {
    this.map.set(item.id, item);
  }

  get(templateId: string): TemplateItem | undefined {
    return this.map.get(templateId);
  }
}
