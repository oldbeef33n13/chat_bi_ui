import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HttpDocRepository } from "../api/http-doc-repository";
import type { CreateDocInput, DocPage, DocRepository, ListDocsParams } from "../api/doc-repository";

/** 文档中心 Hook 暴露给 UI 的能力集合。 */
export interface UseDocLibraryResult {
  repo: DocRepository;
  page: DocPage;
  loading: boolean;
  error?: string;
  filters: Required<Pick<ListDocsParams, "type" | "q" | "page" | "pageSize">>;
  refresh: (next?: Partial<ListDocsParams>) => Promise<void>;
  createDoc: (input: CreateDocInput) => Promise<{ id: string }>;
}

/** 文档列表默认查询条件。 */
const defaultFilters: Required<Pick<ListDocsParams, "type" | "q" | "page" | "pageSize">> = {
  type: "all",
  q: "",
  page: 1,
  pageSize: 20
};

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 文档中心数据管理：统一走后端 API。
 * 设计目标：列表页/详情页只消费 templates 接口，不再维护本地兜底分支。
 */
export const useDocLibrary = (): UseDocLibraryResult => {
  const apiRepo = useMemo(() => new HttpDocRepository("/api/v1"), []);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState<DocPage>({
    items: [],
    total: 0,
    page: defaultFilters.page,
    pageSize: defaultFilters.pageSize
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const bootstrappedRef = useRef(false);

  const runList = useCallback(
    async (targetRepo: DocRepository, nextFilters: ListDocsParams): Promise<DocPage> => {
      return targetRepo.listDocs(nextFilters);
    },
    []
  );

  const refresh = useCallback(
    async (next?: Partial<ListDocsParams>): Promise<void> => {
      // 每次刷新都固化一份完整过滤条件，便于分页和重试保持一致。
      const merged: Required<Pick<ListDocsParams, "type" | "q" | "page" | "pageSize">> = {
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

  const createDoc = useCallback(
    async (input: CreateDocInput): Promise<{ id: string }> => {
      const created = await apiRepo.createDoc(input);
      // 新建后强制刷新，保证列表、计数、排序与后端一致。
      await refresh();
      return { id: created.meta.id };
    },
    [apiRepo, refresh]
  );

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    // 首次挂载只触发一次拉取，避免严格模式下重复刷新。
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
    createDoc
  };
};
