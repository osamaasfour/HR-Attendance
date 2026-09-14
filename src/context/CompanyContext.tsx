/**
 * Tenant / company settings for multi-tenant SaaS.
 * Loads from tenants/{tenantId}; falls back to ensuring default tenant.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import type { Tenant, CompanySettings } from '../types';
import { DEFAULT_TENANT, DEFAULT_TENANT_ID, DEFAULT_COMPANY_SETTINGS } from '../types';
import {
  ensureDefaultTenant,
  getTenantById,
  updateTenant,
  upsertTenantInvite,
} from '../utils/tenants';
import { formatMoney } from '../utils/formatMoney';
import { db, doc, updateDoc } from '../services/firebase';

type CompanyContextValue = {
  tenant: Tenant;
  company: CompanySettings;
  loading: boolean;
  refresh: () => Promise<void>;
  saveCompany: (patch: Partial<CompanySettings & Tenant>) => Promise<void>;
  money: (amount: number) => string;
};

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

function tenantToCompany(t: Tenant): CompanySettings {
  return {
    id: t.id,
    name: t.name,
    logoUrl: t.logoUrl,
    countryCode: t.countryCode,
    currencyCode: t.currencyCode,
    currencySymbol: t.currencySymbol,
    locale: t.locale,
    defaultLanguage: t.defaultLanguage,
    timezone: t.timezone,
    updatedAt: t.updatedAt,
  };
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant>({ ...DEFAULT_TENANT });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!user) {
        setTenant({ ...DEFAULT_TENANT });
        return;
      }
      const tid = user.tenantId || DEFAULT_TENANT_ID;
      if (tid === DEFAULT_TENANT_ID) {
        try {
          await ensureDefaultTenant();
        } catch {
          /* other workspaces cannot read tenants/default */
        }
      }
      let t = await getTenantById(tid);
      if (!t && tid === DEFAULT_TENANT_ID) {
        t = await ensureDefaultTenant();
      }
      if (user && !user.tenantId) {
        try {
          await updateDoc(doc(db, 'users', user.uid), { tenantId: DEFAULT_TENANT_ID });
        } catch {
          /* ignore */
        }
      }
      if (!t) {
        setTenant({ ...DEFAULT_TENANT });
        return;
      }
      setTenant(t);
      if (user.role === 'admin' || user.platformAdmin) {
        void upsertTenantInvite(t).catch(() => undefined);
      }
    } catch (e) {
      console.warn('[Tenant] load failed', e);
      setTenant({ ...DEFAULT_TENANT });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveCompany = useCallback(
    async (patch: Partial<CompanySettings & Tenant>) => {
      const tid = user?.tenantId || tenant.id || DEFAULT_TENANT_ID;
      const payload: Partial<Tenant> = {
        name: patch.name ?? tenant.name,
        countryCode: patch.countryCode ?? tenant.countryCode,
        currencyCode: patch.currencyCode ?? tenant.currencyCode,
        currencySymbol: patch.currencySymbol ?? tenant.currencySymbol,
        locale: patch.locale ?? tenant.locale,
        defaultLanguage: patch.defaultLanguage ?? tenant.defaultLanguage,
        timezone: patch.timezone ?? tenant.timezone,
        slug: tenant.slug,
      };
      if (patch.logoUrl !== undefined) payload.logoUrl = patch.logoUrl;
      else if (tenant.logoUrl !== undefined) payload.logoUrl = tenant.logoUrl;
      if (patch.workSchedule !== undefined) payload.workSchedule = patch.workSchedule;
      else if (tenant.workSchedule !== undefined) payload.workSchedule = tenant.workSchedule;
      if (patch.taxRegistrationNumber !== undefined) {
        payload.taxRegistrationNumber = patch.taxRegistrationNumber;
      } else if (tenant.taxRegistrationNumber !== undefined) {
        payload.taxRegistrationNumber = tenant.taxRegistrationNumber;
      }
      if (patch.socialInsuranceNumber !== undefined) {
        payload.socialInsuranceNumber = patch.socialInsuranceNumber;
      } else if (tenant.socialInsuranceNumber !== undefined) {
        payload.socialInsuranceNumber = tenant.socialInsuranceNumber;
      }

      await updateTenant(tid, payload);
      const next = await getTenantById(tid);
      if (next) setTenant(next);
    },
    [user, tenant],
  );

  const company = useMemo(() => tenantToCompany(tenant), [tenant]);

  const money = useCallback(
    (amount: number) =>
      formatMoney(amount, {
        currencyCode: tenant.currencyCode,
        currencySymbol: tenant.currencySymbol,
        locale: tenant.locale,
      }),
    [tenant],
  );

  const value = useMemo(
    () => ({ tenant, company, loading, refresh, saveCompany, money }),
    [tenant, company, loading, refresh, saveCompany, money],
  );

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}

/** Compatibility — same as DEFAULT_COMPANY_SETTINGS */
export { DEFAULT_COMPANY_SETTINGS };
