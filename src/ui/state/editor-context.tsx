import { createContext, useContext, useMemo } from "react";
import { EditorStore } from "../../core/kernel/editor-store";
import type { DocType } from "../../core/doc/types";
import { resolveTemplate } from "../../runtime/template/templates";
import { createBuiltInDoc } from "../../core/doc/examples";

const EditorContext = createContext<EditorStore | null>(null);

export function EditorProvider({
  docType,
  exampleId,
  children
}: {
  docType: DocType;
  exampleId?: string;
  children: React.ReactNode;
}): JSX.Element {
  const store = useMemo(
    () =>
      new EditorStore(createBuiltInDoc(docType, exampleId), {
        selectedIds: [],
        templateResolver: resolveTemplate
      }),
    [docType, exampleId]
  );
  return <EditorContext.Provider value={store}>{children}</EditorContext.Provider>;
}

export const useEditorStore = (): EditorStore => {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("EditorProvider missing");
  }
  return ctx;
};
