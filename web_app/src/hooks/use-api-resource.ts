"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";

export function useApiResource<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const nextData = await loader();
      if (requestId === requestIdRef.current) setData(nextData);
    } catch (reason) {
      if (requestId === requestIdRef.current) {
        setError(reason instanceof ApiError ? reason.message : "Не удалось загрузить данные");
        setErrorCode(reason instanceof ApiError ? reason.code : null);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  return { data, loading, error, errorCode, reload, setData };
}
