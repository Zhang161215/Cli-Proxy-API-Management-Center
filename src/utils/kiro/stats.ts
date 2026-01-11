import type { KiroAccountItem, KiroAccountStats, KiroUsageBreakdown } from '@/types';

const KIRO_STATUS_ACTIVE = ['active', '正常', '有效'];

function getBreakdown(account: KiroAccountItem): KiroUsageBreakdown | null {
  const usageData = account.usageData;
  if (!usageData) return null;
  return usageData.usageBreakdownList?.[0] || usageData.usageBreakdown || null;
}

export function getQuota(account: KiroAccountItem): number {
  const breakdown = getBreakdown(account);
  if (!breakdown) return -1;

  const main = breakdown.usageLimit ?? 0;
  const freeTrial = breakdown.freeTrialInfo?.usageLimit ?? 0;
  const bonus = breakdown.bonuses?.reduce((sum, b) => sum + (b.usageLimit || 0), 0) ?? 0;

  return main + freeTrial + bonus;
}

export function getUsed(account: KiroAccountItem): number {
  const breakdown = getBreakdown(account);
  if (!breakdown) return -1;

  const main = breakdown.currentUsage ?? 0;
  const freeTrial = breakdown.freeTrialInfo?.currentUsage ?? 0;
  const bonus = breakdown.bonuses?.reduce((sum, b) => sum + (b.currentUsage || 0), 0) ?? 0;

  return main + freeTrial + bonus;
}

export function getSubType(account: KiroAccountItem): string {
  return account.usageData?.subscriptionInfo?.type ?? '';
}

export function getSubPlan(account: KiroAccountItem): string {
  return account.usageData?.subscriptionInfo?.subscriptionTitle ?? '';
}

export function getUsagePercent(used: number, quota: number): number {
  return quota === 0 ? 0 : Math.min(100, (used / quota) * 100);
}

export function getDaysUntilReset(account: KiroAccountItem): number | null {
  const usageData = account.usageData;
  if (usageData?.daysUntilReset !== undefined) {
    return usageData.daysUntilReset;
  }
  if (usageData?.nextDateReset) {
    const resetDate = new Date(usageData.nextDateReset);
    const now = new Date();
    const diffTime = resetDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  const breakdown = getBreakdown(account);
  if (breakdown?.nextDateReset) {
    const resetDate = new Date(breakdown.nextDateReset);
    const now = new Date();
    const diffTime = resetDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return null;
}

export function isProPlus(account: KiroAccountItem): boolean {
  const subType = getSubType(account);
  const subPlan = getSubPlan(account);
  return subType.includes('PRO_PLUS') || subType.includes('PRO+') ||
         subPlan.includes('PRO+') || subPlan.toLowerCase().includes('pro plus');
}

export function isPro(account: KiroAccountItem): boolean {
  if (isProPlus(account)) return false;
  const subType = getSubType(account);
  const subPlan = getSubPlan(account);
  return subType.includes('PRO') || subPlan.includes('PRO');
}

export function isFree(account: KiroAccountItem): boolean {
  const subType = getSubType(account);
  const subPlan = getSubPlan(account);
  if (!subType && !subPlan) return true;
  return subType.includes('FREE') || subPlan.toLowerCase().includes('free');
}

export function isAccountActive(account: KiroAccountItem): boolean {
  return KIRO_STATUS_ACTIVE.includes(account.status);
}

export function isAccountExpired(account: KiroAccountItem): boolean {
  return account.status === 'expired';
}

export function isAccountBanned(account: KiroAccountItem): boolean {
  return account.status === 'banned';
}

export function calcAccountStats(accounts: KiroAccountItem[]): KiroAccountStats {
  const total = accounts.length;
  const active = accounts.filter(isAccountActive).length;
  const banned = accounts.filter(isAccountBanned).length;
  const expired = accounts.filter(isAccountExpired).length;
  const proPlus = accounts.filter(isProPlus).length;
  const pro = accounts.filter(isPro).length;
  const free = accounts.filter(isFree).length;

  const accountsWithUsage = accounts.filter(a => getQuota(a) >= 0);
  const totalQuota = Math.round(accountsWithUsage.reduce((sum, a) => sum + getQuota(a), 0));
  const totalUsed = Math.round(accountsWithUsage.reduce((sum, a) => {
    const used = getUsed(a);
    return sum + (used >= 0 ? used : 0);
  }, 0));
  const usagePercent = totalQuota > 0 ? Number((totalUsed / totalQuota * 100).toFixed(1)) : 0;
  const remaining = totalQuota - totalUsed;

  return {
    total,
    active,
    banned,
    expired,
    proPlus,
    pro,
    free,
    totalQuota,
    totalUsed,
    usagePercent,
    remaining
  };
}

export function formatQuota(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case '正常':
    case '有效':
      return 'green';
    case 'expired':
      return 'orange';
    case 'banned':
      return 'red';
    default:
      return 'gray';
  }
}

export function getProviderIcon(provider: string): string {
  switch (provider) {
    case 'Google':
      return 'google';
    case 'Github':
      return 'github';
    case 'BuilderId':
      return 'aws';
    case 'Enterprise':
      return 'building';
    default:
      return 'user';
  }
}
