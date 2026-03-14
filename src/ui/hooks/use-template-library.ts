import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HttpTemplateRepository } from "../api/http-template-repository";
import type { CreateTemplateInput, ListTemplatesParams, TemplatePage, TemplateRepository } from "../api/template-repository";

export interface UseTemplateLibraryResult {
  repo: TemplateRepository;
  page: TemplatePage;
  loading: boolean;
  error?: string;
  filters: Required<Pick<ListTemplatesParams, "type" | "q" | "page" | "pageSize">>;
  refresh: (next?: Partial<ListTemplatesParams>) => Promise<void>;
  createTemplate: (input: CreateTemplateInput) => Promise<{ id: string }>;
}

const defaultFilters: Required<Pick<ListTemplatesParams, "type" | "q" | "page" | "pageSize">> = {
  type: "all",
  q: "",
  page: 1,
  pageSize: 20
};

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useTemplateLibrary = (): UseTemplateLibraryResult => {
  const apiRepo = useMemo(() => new HttpTemplateRepository("/api/v1"), []);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState<TemplatePage>({
    items: [],
    total: 0,
    page: defaultFilters.page,
    pageSize: defaultFilters.pageSize
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const bootstrappedRef = useRef(false);

  const runList = useCallback(async (targetRepo: TemplateRepository, nextFilters: ListTemplatesParams): Promise<TemplatePage> => {
    return targetRepo.listTemplates(nextFilters);
  }, []);

  const refresh = useCallback(
    async (next?: Partial<ListTemplatesParams>): Promise<void> => {
      const merged: Required<Pick<ListTemplatesParams, "type" | "q" | "page" | "pageSize">> = {
        ...filters,
        ...(next ?? {})
      };
      setFilters(merged);
      setLoading(true);
      setError(undefined);
      try {
        const result = await runList(apiRepo, merged);
        setPage(result);
      } catch (currentError) {
        setError(toMessage(currentError));
        throw currentError;
      } finally {
        setLoading(false);
      }
    },
    [apiRepo, filters, runList]
  );

  const createTemplate = useCallback(
    async (input: CreateTemplateInput): Promise<{ id: string }> => {
      const created = await apiRepo.createTemplate(input);
      await refresh();
      return { id: created.meta.id };
    },
    [apiRepo, refresh]
  );

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;
    void refresh().catch(() => undefined);
  }, [refresh]);

  return {
    repo: apiRepo,
    page,
    loading,
    error,
    filters,
    refresh,
    createTemplate
  };
};
