import { createContext, useContext, useEffect, useMemo, useRef } from "react";
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
  onDocChange,
  children
}: {
  docType?: DocType;
  exampleId?: string;
  initialDoc?: VDoc;
  onDocChange?: (doc: VDoc) => void;
  children: React.ReactNode;
}): JSX.Element {
  // 优先使用外部 initialDoc，否则按 docType/exampleId 生成内置样例。
  const resolvedInitialDoc = useMemo(() => (initialDoc ? structuredClone(initialDoc) : createBuiltInDoc(docType, exampleId)), [docType, exampleId, initialDoc]);
  const store = useMemo(
    () =>
      new EditorStore(resolvedInitialDoc, {
        selectedIds: [],
        templateResolver: resolveTemplate
      }),
    [resolvedInitialDoc]
  );
  return (
    <EditorContext.Provider value={store}>
      {onDocChange ? <EditorDocSync onDocChange={onDocChange} /> : null}
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

function EditorDocSync({ onDocChange }: { onDocChange: (doc: VDoc) => void }): null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const onDocChangeRef = useRef(onDocChange);

  useEffect(() => {
    onDocChangeRef.current = onDocChange;
  }, [onDocChange]);

  useEffect(() => {
    if (doc) {
      // 外层持久化会话依赖这个同步回调（编辑态实时快照）。
      onDocChangeRef.current(doc);
    }
  }, [doc]);
  return null;
}
