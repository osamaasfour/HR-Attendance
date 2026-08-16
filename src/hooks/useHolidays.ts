import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchHolidays } from '../utils/holidays';
import type { Holiday } from '../types';

export function useHolidays() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || 'default';
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const list = await fetchHolidays(tenantId);
      setHolidays(list);
    } catch (e) {
      console.warn('[holidays] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  return { holidays, loading, reload, tenantId };
}
