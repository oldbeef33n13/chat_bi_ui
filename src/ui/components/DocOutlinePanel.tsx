import { useEffect, useRef, useState } from "react";
import type { VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { cloneNodeWithNewIds, findAncestorByKind } from "../utils/node-tree";

interface OutlineSectionItem {
  node: VNode;
  parentId?: string;
  level: 1 | 2;
  orderKey: string;
}

interface DragOutlineItem {
  nodeId: string;
  level: 1 | 2;
  parentId?: string;
}

/**
 * 目录面板：
 * - Report 支持两层章节树（章节/子章节）
 * - 目录内支持拖拽排序与上下插入/复制/删除
 * - PPT 目录支持页面拖拽排序与快捷结构操作
 */
export function DocOutlinePanel(): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const [dragging, setDragging] = useState<DragOutlineItem | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [previewMenuId, setPreviewMenuId] = useState<string | null>(null);
  const [lockedMenuId, setLockedMenuId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeAllMenus = (): void => {
    setPreviewMenuId(null);
    setLockedMenuId(null);
  };
  const closeTitleEditor = (): void => {
    setEditingNodeId(null);
    setEditingTitle("");
  };
  const startTitleEdit = (node: VNode, fallbackTitle: string): void => {
    setEditingNodeId(node.id);
    setEditingTitle(String((node.props as Record<string, unknown> | undefined)?.title ?? fallbackTitle));
    closeAllMenus();
  };
  const commitTitleEdit = (summary: string): void => {
    if (!editingNodeId) {
      return;
    }
    const nextTitle = editingTitle.trim();
    if (!nextTitle) {
      closeTitleEditor();
      return;
    }
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: editingNodeId,
        props: { title: nextTitle }
      },
      { summary, mergeWindowMs: 140 }
    );
    closeTitleEditor();
  };
  const isMenuOpen = (nodeId: string): boolean => lockedMenuId === nodeId || (lockedMenuId === null && previewMenuId === nodeId);
  const openMenuPreview = (nodeId: string): void => {
    if (lockedMenuId !== null) {
      return;
    }
    setPreviewMenuId(nodeId);
  };
  const closeMenuPreview = (): void => {
    if (lockedMenuId !== null) {
      return;
    }
    setPreviewMenuId(null);
  };
  const toggleMenuLock = (nodeId: string): void => {
    if (lockedMenuId === nodeId) {
      closeAllMenus();
      return;
    }
    setLockedMenuId(nodeId);
    setPreviewMenuId(nodeId);
  };

  useEffect(() => {
    closeAllMenus();
    closeTitleEditor();
  }, [doc?.docId, selection.primaryId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target || !panelRef.current) {
        return;
      }
      if (!panelRef.current.contains(target)) {
        closeAllMenus();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeAllMenus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!doc) {
    return <div className="panel-body muted">No document</div>;
  }

  if (doc.docType === "report") {
    const sections = (doc.root.children ?? []).filter((node) => node.kind === "section");
    const activeSectionId = findAncestorByKind(doc.root, selection.primaryId, "section")?.id;
    const flatItems: OutlineSectionItem[] = [];
    sections.forEach((section, index) => {
      flatItems.push({ node: section, level: 1, orderKey: `${index + 1}` });
      const subsections = (section.children ?? []).filter((child) => child.kind === "section");
      subsections.forEach((sub, subIndex) => {
        flatItems.push({
          node: sub,
          parentId: section.id,
          level: 2,
          orderKey: `${index + 1}.${subIndex + 1}`
        });
      });
    });

    const createSectionNode = (title?: string): VNode => ({
      id: prefixedId("section"),
      kind: "section",
      props: { title: title ?? `章节 ${sections.length + 1}` },
      children: []
    });

    const createSubsectionNode = (section: VNode): VNode => {
      const siblings = (section.children ?? []).filter((child) => child.kind === "section");
      return {
        id: prefixedId("section"),
        kind: "section",
        props: { title: `子章节 ${siblings.length + 1}` },
        children: []
      };
    };

    const insertSectionAt = (index: number, title?: string): void => {
      const bounded = Math.max(0, Math.min(index, sections.length));
      store.executeCommand(
        {
          type: "InsertNode",
          parentId: doc.root.id,
          index: bounded,
          node: createSectionNode(title)
        },
        { summary: "outline insert report section" }
      );
    };

    const insertSubsectionAt = (section: VNode, index: number): void => {
      const sectionChildren = section.children ?? [];
      const subsections = sectionChildren.filter((child) => child.kind === "section");
      const bounded = Math.max(0, Math.min(index, subsections.length));
      // 章节节点放在 parent.children 前半区，避免和 block 内容混排导致目录/渲染不一致。
      store.executeCommand(
        {
          type: "InsertNode",
          parentId: section.id,
          index: bounded,
          node: createSubsectionNode(section)
        },
        { summary: "outline insert report subsection" }
      );
    };

    const duplicateSectionAt = (section: VNode, index: number): void => {
      const cloned = cloneNodeWithNewIds(section);
      const sourceTitle = String((section.props as Record<string, unknown> | undefined)?.title ?? "章节");
      cloned.props = { ...(cloned.props ?? {}), title: `${sourceTitle} 副本` };
      store.executeCommand(
        {
          type: "InsertNode",
          parentId: doc.root.id,
          index,
          node: cloned
        },
        { summary: "outline duplicate report section" }
      );
    };

    const duplicateSubsectionAt = (subsection: VNode, parentSection: VNode, index: number): void => {
      const cloned = cloneNodeWithNewIds(subsection);
      const sourceTitle = String((subsection.props as Record<string, unknown> | undefined)?.title ?? "子章节");
      cloned.props = { ...(cloned.props ?? {}), title: `${sourceTitle} 副本` };
      store.executeCommand(
        {
          type: "InsertNode",
          parentId: parentSection.id,
          index,
          node: cloned
        },
        { summary: "outline duplicate report subsection" }
      );
    };

    const findSectionById = (sectionId: string): VNode | undefined => sections.find((item) => item.id === sectionId);

    const topSectionIndexById = (sectionId: string): number => sections.findIndex((item) => item.id === sectionId);
    const subsectionIndexById = (parentSection: VNode, subsectionId: string): number =>
      (parentSection.children ?? []).filter((item) => item.kind === "section").findIndex((item) => item.id === subsectionId);

    const canDrop = (drag: DragOutlineItem, target: OutlineSectionItem): boolean => {
      if (drag.nodeId === target.node.id) {
        return false;
      }
      if (drag.level !== target.level) {
        return false;
      }
      if (drag.level === 2) {
        return !!drag.parentId && !!target.parentId;
      }
      return true;
    };

    const applyDrop = (drag: DragOutlineItem, target: OutlineSectionItem): void => {
      if (!canDrop(drag, target)) {
        return;
      }
      if (drag.level === 1) {
        const targetIndex = topSectionIndexById(target.node.id);
        if (targetIndex < 0) {
          return;
        }
        store.executeCommand(
          {
            type: "MoveNode",
            nodeId: drag.nodeId,
            newParentId: doc.root.id,
            newIndex: targetIndex
          },
          { summary: "outline drag reorder top section" }
        );
        return;
      }
      const targetParent = findSectionById(target.parentId ?? "");
      if (!targetParent) {
        return;
      }
      const targetIndex = subsectionIndexById(targetParent, target.node.id);
      if (targetIndex < 0) {
        return;
      }
      store.executeCommand(
        {
          type: "MoveNode",
          nodeId: drag.nodeId,
          newParentId: targetParent.id,
          newIndex: targetIndex
        },
        { summary: "outline drag reorder subsection" }
      );
    };

    const findParentSection = (subsection: VNode, parentId: string | undefined): VNode | undefined => {
      if (!parentId) {
        return undefined;
      }
      return sections.find((section) => section.id === parentId && (section.children ?? []).some((item) => item.id === subsection.id));
    };

    return (
      <div ref={panelRef} className="col" style={{ height: "100%" }}>
        <div className="panel-header">
          <strong>章节目录</strong>
          <div className="row">
            <span className="chip">{flatItems.length} 节点</span>
            <button className="btn mini-btn" onClick={() => insertSectionAt(sections.length)}>
              +章节
            </button>
          </div>
        </div>
        <div className="panel-body outline-body">
          {sections.length === 0 ? <div className="muted">暂无章节</div> : null}
          {flatItems.map((item) => {
            const isActive = activeSectionId === item.node.id;
            const title = String((item.node.props as Record<string, unknown>)?.title ?? (item.level === 1 ? "未命名章节" : "未命名子章节"));
            const parentSection = item.level === 2 ? findParentSection(item.node, item.parentId) : undefined;
            const itemIndex = item.level === 1 ? topSectionIndexById(item.node.id) : parentSection ? subsectionIndexById(parentSection, item.node.id) : -1;
            const isEditingTitle = editingNodeId === item.node.id;
            return (
              <div
                key={item.node.id}
                className={`outline-item ${isActive ? "active" : ""} ${item.level === 2 ? "sublevel" : ""} ${dropTargetId === item.node.id ? "drop-target" : ""}`}
              >
                <div className="outline-head">
                  {isEditingTitle ? (
                    <div className="row" style={{ flex: 1 }}>
                      <span className="outline-index">{item.orderKey}</span>
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 0 }}
                        placeholder="请输入标题"
                        value={editingTitle}
                        autoFocus
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitTitleEdit("outline rename report section");
                          } else if (event.key === "Escape") {
                            closeTitleEditor();
                          }
                        }}
                      />
                      <button className="btn mini-btn" onClick={() => commitTitleEdit("outline rename report section")}>
                        保存
                      </button>
                      <button className="btn mini-btn" onClick={closeTitleEditor}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      className="outline-main"
                      draggable
                      onDragStart={() => {
                        setDragging({ nodeId: item.node.id, level: item.level, parentId: item.parentId });
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTargetId(null);
                      }}
                      onDragOver={(event) => {
                        if (!dragging || !canDrop(dragging, item)) {
                          return;
                        }
                        event.preventDefault();
                        setDropTargetId(item.node.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragging) {
                          applyDrop(dragging, item);
                        }
                        setDragging(null);
                        setDropTargetId(null);
                      }}
                      onClick={() => store.setSelection(item.node.id, false)}
                      onDoubleClick={() => startTitleEdit(item.node, item.level === 1 ? "未命名章节" : "未命名子章节")}
                      title={`拖拽可排序：${title}`}
                    >
                      <span className="outline-index">{item.orderKey}</span>
                      <span className="outline-title">{title}</span>
                    </button>
                  )}
                  <div className="outline-more-wrap" onMouseEnter={() => openMenuPreview(item.node.id)} onMouseLeave={closeMenuPreview}>
                    <button
                      className={`outline-more-btn ${isMenuOpen(item.node.id) ? "active" : ""}`}
                      title="章节操作"
                      aria-label="更多操作"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMenuLock(item.node.id);
                      }}
                    >
                      ⋯
                    </button>
                    {isMenuOpen(item.node.id) ? (
                      <div className="outline-menu">
                        {item.level === 1 ? (
                          <>
                            <button className="outline-menu-item" onClick={() => { insertSectionAt(Math.max(0, itemIndex)); closeAllMenus(); }}>
                              上方插入章节
                            </button>
                            <button className="outline-menu-item" onClick={() => { insertSectionAt(Math.max(0, itemIndex) + 1); closeAllMenus(); }}>
                              下方插入章节
                            </button>
                            <button
                              className="outline-menu-item"
                              onClick={() => {
                                insertSubsectionAt(item.node, (item.node.children ?? []).filter((child) => child.kind === "section").length);
                                closeAllMenus();
                              }}
                            >
                              新增子章节
                            </button>
                            <button
                              className="outline-menu-item"
                              onClick={() => {
                                startTitleEdit(item.node, "未命名章节");
                              }}
                            >
                              重命名
                            </button>
                            <button className="outline-menu-item" onClick={() => { duplicateSectionAt(item.node, Math.max(0, itemIndex) + 1); closeAllMenus(); }}>
                              复制章节
                            </button>
                            <button
                              className="outline-menu-item danger"
                              onClick={() => {
                                store.executeCommand({ type: "RemoveNode", nodeId: item.node.id }, { summary: "outline remove report section" });
                                closeAllMenus();
                              }}
                            >
                              删除章节
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="outline-menu-item" onClick={() => { if (parentSection) { insertSubsectionAt(parentSection, Math.max(0, itemIndex)); } closeAllMenus(); }}>
                              上方插入子章节
                            </button>
                            <button className="outline-menu-item" onClick={() => { if (parentSection) { insertSubsectionAt(parentSection, Math.max(0, itemIndex) + 1); } closeAllMenus(); }}>
                              下方插入子章节
                            </button>
                            <button className="outline-menu-item" onClick={() => { if (parentSection) { duplicateSubsectionAt(item.node, parentSection, Math.max(0, itemIndex) + 1); } closeAllMenus(); }}>
                              复制子章节
                            </button>
                            <button
                              className="outline-menu-item"
                              onClick={() => {
                                startTitleEdit(item.node, "未命名子章节");
                              }}
                            >
                              重命名
                            </button>
                            <button
                              className="outline-menu-item danger"
                              onClick={() => {
                                store.executeCommand({ type: "RemoveNode", nodeId: item.node.id }, { summary: "outline remove report subsection" });
                                closeAllMenus();
                              }}
                            >
                              删除子章节
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (doc.docType === "ppt") {
    const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
    const activeSlideId = findAncestorByKind(doc.root, selection.primaryId, "slide")?.id;

    const createSlideNode = (title?: string): VNode => ({
      id: prefixedId("slide"),
      kind: "slide",
      props: { title: title ?? `页面 ${slides.length + 1}`, layoutTemplateId: "title-double-summary" },
      layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
      children: [
        {
          id: prefixedId("text"),
          kind: "text",
          layout: { mode: "absolute", x: 40, y: 24, w: 320, h: 50, z: 1 },
          props: { text: "页面标题", format: "plain" }
        }
      ]
    });

    const insertSlideAt = (index: number, title?: string): void => {
      const bounded = Math.max(0, Math.min(index, slides.length));
      store.executeCommand(
        {
          type: "InsertNode",
          parentId: doc.root.id,
          index: bounded,
          node: createSlideNode(title)
        },
        { summary: "outline insert slide" }
      );
    };

    const duplicateSlideAt = (slide: VNode, index: number): void => {
      const cloned = cloneNodeWithNewIds(slide);
      const sourceTitle = String((slide.props as Record<string, unknown> | undefined)?.title ?? "页面");
      cloned.props = { ...(cloned.props ?? {}), title: `${sourceTitle} 副本` };
      store.executeCommand(
        {
          type: "InsertNode",
          parentId: doc.root.id,
          index,
          node: cloned
        },
        { summary: "outline duplicate slide" }
      );
    };

    const slideIndexById = (slideId: string): number => slides.findIndex((item) => item.id === slideId);

    const canDropSlide = (targetId: string): boolean => !!dragging && dragging.level === 1 && dragging.nodeId !== targetId;

    return (
      <div ref={panelRef} className="col" style={{ height: "100%" }}>
        <div className="panel-header">
          <strong>页面目录</strong>
          <div className="row">
            <span className="chip">{slides.length} 页</span>
            <button className="btn mini-btn" onClick={() => insertSlideAt(slides.length)}>
              +页面
            </button>
          </div>
        </div>
        <div className="panel-body outline-body">
          {slides.length === 0 ? <div className="muted">暂无页面</div> : null}
          {slides.map((slide, index) => (
            <div key={slide.id} className={`outline-item ${activeSlideId === slide.id ? "active" : ""} ${dropTargetId === slide.id ? "drop-target" : ""}`}>
              <div className="outline-head">
                {(() => {
                  const title = String((slide.props as Record<string, unknown>)?.title ?? `页面 ${index + 1}`);
                  const children = slide.children ?? [];
                  const chartCount = children.filter((item) => item.kind === "chart").length;
                  const tableCount = children.filter((item) => item.kind === "table").length;
                  const textCount = children.filter((item) => item.kind === "text").length;
                  return editingNodeId === slide.id ? (
                    <div className="row" style={{ flex: 1 }}>
                      <span className="outline-index">{index + 1}</span>
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 0 }}
                        placeholder="请输入标题"
                        value={editingTitle}
                        autoFocus
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitTitleEdit("outline rename slide");
                          } else if (event.key === "Escape") {
                            closeTitleEditor();
                          }
                        }}
                      />
                      <button className="btn mini-btn" onClick={() => commitTitleEdit("outline rename slide")}>
                        保存
                      </button>
                      <button className="btn mini-btn" onClick={closeTitleEditor}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      className="outline-main"
                      draggable
                      onDragStart={() => setDragging({ nodeId: slide.id, level: 1 })}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTargetId(null);
                      }}
                      onDragOver={(event) => {
                        if (!canDropSlide(slide.id)) {
                          return;
                        }
                        event.preventDefault();
                        setDropTargetId(slide.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!dragging || !canDropSlide(slide.id)) {
                          return;
                        }
                        const targetIndex = slideIndexById(slide.id);
                        if (targetIndex < 0) {
                          return;
                        }
                        store.executeCommand(
                          {
                            type: "MoveNode",
                            nodeId: dragging.nodeId,
                            newParentId: doc.root.id,
                            newIndex: targetIndex
                          },
                          { summary: "outline drag reorder slide" }
                        );
                        setDragging(null);
                        setDropTargetId(null);
                      }}
                      onClick={() => store.setSelection(slide.id, false)}
                      onDoubleClick={() => startTitleEdit(slide, `页面 ${index + 1}`)}
                      title={`拖拽可排序：${title}`}
                    >
                      <span className="outline-index">{index + 1}</span>
                      <span className="col outline-title-wrap">
                        <span className="outline-title">{title}</span>
                        <span className="outline-subtitle">{`元素 ${children.length} · 图 ${chartCount} / 表 ${tableCount} / 文 ${textCount}`}</span>
                      </span>
                    </button>
                  );
                })()}
                <div className="outline-more-wrap" onMouseEnter={() => openMenuPreview(slide.id)} onMouseLeave={closeMenuPreview}>
                  <button
                    className={`outline-more-btn ${isMenuOpen(slide.id) ? "active" : ""}`}
                    title="页面操作"
                    aria-label="更多操作"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMenuLock(slide.id);
                    }}
                  >
                    ⋯
                  </button>
                  {isMenuOpen(slide.id) ? (
                    <div className="outline-menu">
                      <button className="outline-menu-item" onClick={() => { insertSlideAt(index); closeAllMenus(); }}>
                        上方插入页面
                      </button>
                      <button className="outline-menu-item" onClick={() => { insertSlideAt(index + 1); closeAllMenus(); }}>
                        下方插入页面
                      </button>
                      <button className="outline-menu-item" onClick={() => { duplicateSlideAt(slide, index + 1); closeAllMenus(); }}>
                        复制页面
                      </button>
                      <button
                        className="outline-menu-item"
                        onClick={() => {
                          startTitleEdit(slide, `页面 ${index + 1}`);
                        }}
                      >
                        重命名
                      </button>
                      <button
                        className="outline-menu-item danger"
                        onClick={() => {
                          store.executeCommand({ type: "RemoveNode", nodeId: slide.id }, { summary: "outline remove slide" });
                          closeAllMenus();
                        }}
                      >
                        删除页面
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="col" style={{ height: "100%" }}>
      <div className="panel-header">
        <strong>目录</strong>
      </div>
      <div className="panel-body muted">当前文档类型无需目录面板</div>
    </div>
  );
}
