import { useCallback, useEffect, useRef, useState } from "react";

export function useAsyncData<T>(loader: () => Promise<T>, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const nextData = await loader();
      if (version === requestVersion.current) setData(nextData);
    } catch (nextError) {
      if (version === requestVersion.current) setError(nextError);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  return { data, loading, error, refresh };
}
