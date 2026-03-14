import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EditorStore } from "../../core/kernel/editor-store";
import type { DocType, VDoc } from "../../core/doc/types";
import { resolveTemplate } from "../../runtime/template/templates";
import { createBuiltInDoc } from "../../core/doc/examples";
import { useSignalValue } from "./use-signal-value";

const EditorContext = createContext<EditorStore | null>(null);

export function EditorProvider({
  docType = "dashboard",
  exampleId,
  initialDoc,
  baselineDoc,
  baseRevision = 0,
  onDocChange,
  onDirtyChange,
  children
}: {
  docType?: DocType;
  exampleId?: string;
  initialDoc?: VDoc;
  baselineDoc?: VDoc;
  baseRevision?: number;
  onDocChange?: (doc: VDoc) => void;
  onDirtyChange?: (dirty: boolean) => void;
  children: React.ReactNode;
}): JSX.Element {
  // 优先使用外部 initialDoc，否则按 docType/exampleId 生成内置样例。
  const resolvedInitialDoc = useMemo(() => (initialDoc ? structuredClone(initialDoc) : createBuiltInDoc(docType, exampleId)), [docType, exampleId, initialDoc]);
  const resolvedBaselineDoc = useMemo(() => (baselineDoc ? structuredClone(baselineDoc) : resolvedInitialDoc), [baselineDoc, resolvedInitialDoc]);
  const [store] = useState(
    () =>
      new EditorStore(resolvedInitialDoc, {
        selectedIds: [],
        templateResolver: resolveTemplate
      }, resolvedBaselineDoc, baseRevision)
  );
  return (
    <EditorContext.Provider value={store}>
      {onDocChange || onDirtyChange ? <EditorStoreSync onDocChange={onDocChange} onDirtyChange={onDirtyChange} /> : null}
      {children}
    </EditorContext.Provider>
  );
}

export const useEditorStore = (): EditorStore => {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("EditorProvider missing");
  }
  return ctx;
};

export const useMaybeEditorStore = (): EditorStore | null => useContext(EditorContext);

function EditorStoreSync({
  onDocChange,
  onDirtyChange
}: {
  onDocChange?: (doc: VDoc) => void;
  onDirtyChange?: (dirty: boolean) => void;
}): null {
  const store = useEditorStore();
  const docRevision = useSignalValue(store.docRevision);
  const dirty = useSignalValue(store.isDirty);
  const onDocChangeRef = useRef(onDocChange);
  const onDirtyChangeRef = useRef(onDirtyChange);

  useEffect(() => {
    onDocChangeRef.current = onDocChange;
  }, [onDocChange]);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    const snapshot = store.doc.value;
    if (snapshot && onDocChangeRef.current) {
      // 外层持久化会话依赖这个同步回调（编辑态实时快照）。
      onDocChangeRef.current(snapshot);
    }
  }, [docRevision, store]);

  useEffect(() => {
    if (onDirtyChangeRef.current) {
      onDirtyChangeRef.current(dirty);
    }
  }, [dirty]);
  return null;
}
