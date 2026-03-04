import { createContext, useContext, useEffect, useMemo } from "react";
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

function EditorDocSync({ onDocChange }: { onDocChange: (doc: VDoc) => void }): null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  useEffect(() => {
    if (doc) {
      onDocChange(doc);
    }
  }, [doc, onDocChange]);
  return null;
}
