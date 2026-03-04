import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HttpDocRepository } from "../api/http-doc-repository";
import { createLocalDocRepository } from "../api/local-doc-repository";
import type { CreateDocInput, DocDataSource, DocPage, DocRepository, ListDocsParams } from "../api/doc-repository";

/** 文档中心 Hook 暴露给 UI 的能力集合。 */
export interface UseDocLibraryResult {
  repo: DocRepository;
  source: DocDataSource;
  page: DocPage;
  loading: boolean;
  error?: string;
  filters: Required<Pick<ListDocsParams, "type" | "status" | "q" | "page" | "pageSize">>;
  refresh: (next?: Partial<ListDocsParams>) => Promise<void>;
  createDoc: (input: CreateDocInput) => Promise<{ id: string }>;
}

/** 文档列表默认查询条件。 */
const defaultFilters: Required<Pick<ListDocsParams, "type" | "status" | "q" | "page" | "pageSize">> = {
  type: "all",
  status: "all",
  q: "",
  page: 1,
  pageSize: 20
};

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 文档中心数据管理：优先 API，失败后自动降级到 local 仓储。
 * 设计目标：列表页/详情页逻辑不关心当前数据来源，只消费统一接口。
 */
export const useDocLibrary = (): UseDocLibraryResult => {
  const apiRepo = useMemo(() => new HttpDocRepository("/api/v1"), []);
  const localRepo = useMemo(() => createLocalDocRepository(), []);
  const [source, setSource] = useState<DocDataSource>("api");
  const [repo, setRepo] = useState<DocRepository>(apiRepo);
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
      const merged: Required<Pick<ListDocsParams, "type" | "status" | "q" | "page" | "pageSize">> = {
        ...filters,
        ...(next ?? {})
      };
      setFilters(merged);
      setLoading(true);
      setError(undefined);
      if (source === "api") {
        try {
          const result = await runList(apiRepo, merged);
          setPage(result);
          setRepo(apiRepo);
          setSource("api");
          return;
        } catch (apiError) {
          // API 异常时自动切到本地仓储，保证页面可继续操作与调试。
          try {
            const result = await runList(localRepo, merged);
            setPage(result);
            setRepo(localRepo);
            setSource("local");
            setError(`API 不可用，已切换本地数据源：${toMessage(apiError)}`);
            return;
          } catch (localError) {
            setError(`加载失败：${toMessage(localError)}`);
            throw localError;
          }
        } finally {
          setLoading(false);
        }
      }
      try {
        const result = await runList(repo, merged);
        setPage(result);
      } catch (currentError) {
        setError(toMessage(currentError));
        throw currentError;
      } finally {
        setLoading(false);
      }
    },
    [apiRepo, filters, localRepo, repo, runList, source]
  );

  const createDoc = useCallback(
    async (input: CreateDocInput): Promise<{ id: string }> => {
      const created = await repo.createDoc(input);
      // 新建后强制刷新，保证列表、计数、排序与后端一致。
      await refresh();
      return { id: created.meta.id };
    },
    [refresh, repo]
  );

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    // 首次挂载只触发一次拉取，避免严格模式下重复刷新。
    bootstrappedRef.current = true;
    void refresh();
  }, [refresh]);

  return {
    repo,
    source,
    page,
    loading,
    error,
    filters,
    refresh,
    createDoc
  };
};
