import { useEffect, useMemo, useState } from "react";
import type { DataEndpointMeta } from "../api/data-endpoint-repository";
import { HttpDataEndpointRepository } from "../api/http-data-endpoint-repository";

interface UseDataEndpointsResult {
  items: DataEndpointMeta[];
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
}

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useDataEndpoints = (): UseDataEndpointsResult => {
  const repo = useMemo(() => new HttpDataEndpointRepository("/api/v1"), []);
  const [items, setItems] = useState<DataEndpointMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = async (): Promise<void> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await repo.listEndpoints();
      setItems(result.items);
    } catch (nextError) {
      setError(toMessage(nextError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return { items, loading, error, refresh };
};

