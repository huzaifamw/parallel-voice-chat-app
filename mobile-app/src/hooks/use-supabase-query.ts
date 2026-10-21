import { DependencyList, useCallback, useEffect, useState } from 'react';

export function useSupabaseQuery<T>(loader: () => Promise<T>, dependencies: DependencyList, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Could not load data.';
      console.error('Supabase query failed:', reason);
      setError(message);
    } finally {
      setLoading(false);
    }
  // The caller controls when the query should be recreated.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh, setData };
}
