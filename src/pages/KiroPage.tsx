import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { KiroStatsHeader, KiroAccountList, KiroImportModal } from '@/components/kiro';
import { kiroApi } from '@/services/api';
import { calcAccountStats } from '@/utils/kiro';
import { useNotificationStore } from '@/stores';
import type { KiroAccountItem, KiroAccountStats } from '@/types';
import styles from './KiroPage.module.scss';

const emptyStats: KiroAccountStats = {
  total: 0,
  active: 0,
  banned: 0,
  expired: 0,
  proPlus: 0,
  pro: 0,
  free: 0,
  totalQuota: 0,
  totalUsed: 0,
  usagePercent: 0,
  remaining: 0,
};

const CACHE_KEY = 'kiro_accounts_cache';

function loadCacheFromStorage(): { accounts: KiroAccountItem[]; stats: KiroAccountStats } {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const accounts = JSON.parse(raw) as KiroAccountItem[];
      return { accounts, stats: calcAccountStats(accounts) };
    }
  } catch {}
  return { accounts: [], stats: emptyStats };
}

function saveCacheToStorage(accounts: KiroAccountItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(accounts));
  } catch {}
}

const initialCache = loadCacheFromStorage();
let cachedAccounts: KiroAccountItem[] = initialCache.accounts;
let cachedStats: KiroAccountStats = initialCache.stats;

type StatusFilter = 'all' | 'active' | 'abnormal' | 'expired' | 'banned';

export function KiroPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();

  const [accounts, setAccounts] = useState<KiroAccountItem[]>([]);
  const [stats, setStats] = useState<KiroAccountStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'batch' | 'expired' | 'abnormal'; id?: string } | null>(null);
  const [detailsModal, setDetailsModal] = useState<KiroAccountItem | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const loadedRef = useRef(false);

  const filteredAccounts = useMemo(() => {
    if (statusFilter === 'all') return accounts;
    if (statusFilter === 'active') return accounts.filter((a) => a.status === 'active');
    if (statusFilter === 'abnormal') return accounts.filter((a) => a.status === 'expired' || a.status === 'banned');
    if (statusFilter === 'expired') return accounts.filter((a) => a.status === 'expired');
    if (statusFilter === 'banned') return accounts.filter((a) => a.status === 'banned');
    return accounts;
  }, [accounts, statusFilter]);

  const updateCache = useCallback((newAccounts: KiroAccountItem[]) => {
    cachedAccounts = newAccounts;
    cachedStats = calcAccountStats(newAccounts);
    saveCacheToStorage(newAccounts);
    setAccounts(newAccounts);
    setStats(cachedStats);
  }, []);

  const fetchUsageForAccounts = useCallback(async (accountList: KiroAccountItem[]) => {
    const BATCH_SIZE = 10;
    const results = [...accountList];
    
    for (let i = 0; i < accountList.length; i += BATCH_SIZE) {
      const batch = accountList.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (account, batchIndex) => {
        if (!account.fileName) return;
        try {
          const usage = await kiroApi.getKiroUsage(account.fileName);
          if (usage.status === 'ok') {
            const idx = i + batchIndex;
            results[idx] = {
              ...results[idx],
              status: 'active',
              usageData: {
                usageBreakdownList: [{
                  currentUsage: usage.current_usage ?? 0,
                  usageLimit: usage.usage_limit ?? 0,
                }],
                subscriptionInfo: {
                  type: 'subscription',
                  subscriptionTitle: usage.subscription_title ?? 'Free',
                },
              },
            };
          } else if (usage.status === 'banned') {
            const idx = i + batchIndex;
            results[idx] = { ...results[idx], status: 'banned' };
          } else if (usage.status === 'expired' || usage.error?.includes('expired')) {
            const idx = i + batchIndex;
            results[idx] = { ...results[idx], status: 'expired' };
          }
        } catch {
        }
      });
      await Promise.allSettled(promises);
      updateCache([...results]);
    }
  }, [updateCache]);

  const loadAccounts = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh && cachedAccounts.length > 0) {
      setAccounts(cachedAccounts);
      setStats(cachedStats);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await kiroApi.getAccounts();
      updateCache(data);
    } catch {
      showNotification(t('common.error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [updateCache, showNotification, t]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadAccounts(cachedAccounts.length === 0);
  }, [loadAccounts]);

  const handleRefresh = useCallback(async (id: string) => {
    setRefreshingId(id);
    try {
      const account = accounts.find((a) => a.id === id);
      if (account?.fileName) {
        const usage = await kiroApi.getKiroUsage(account.fileName);
        if (usage.status === 'ok') {
          const newAccounts = accounts.map(a => {
            if (a.id !== id) return a;
            return {
              ...a,
              status: 'active' as const,
              usageData: {
                usageBreakdownList: [{
                  currentUsage: usage.current_usage ?? 0,
                  usageLimit: usage.usage_limit ?? 0,
                }],
                subscriptionInfo: {
                  type: 'subscription',
                  subscriptionTitle: usage.subscription_title ?? 'Free',
                },
              },
            };
          });
          updateCache(newAccounts);
        } else if (usage.status === 'banned') {
          const newAccounts = accounts.map(a => a.id === id ? { ...a, status: 'banned' as const } : a);
          updateCache(newAccounts);
        } else if (usage.status === 'expired' || usage.error?.includes('expired')) {
          const newAccounts = accounts.map(a => a.id === id ? { ...a, status: 'expired' as const } : a);
          updateCache(newAccounts);
        }
      }
      showNotification(t('kiro.notification.refreshed'), 'success');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (errorMsg.includes('403') || errorMsg.includes('401')) {
        const newAccounts = accounts.map(a => a.id === id ? { ...a, status: 'expired' as const } : a);
        updateCache(newAccounts);
        showNotification('Token 已过期', 'error');
      } else {
        showNotification(t('common.error'), 'error');
      }
    } finally {
      setRefreshingId(null);
    }
  }, [accounts, updateCache, showNotification, t]);

  const handleRefreshAll = useCallback(async () => {
    setRefreshingAll(true);
    try {
      await fetchUsageForAccounts(accounts);
      showNotification(t('kiro.notification.allRefreshed', { success: accounts.length, failed: 0 }), 'success');
    } catch {
      showNotification(t('common.error'), 'error');
    } finally {
      setRefreshingAll(false);
    }
  }, [accounts, fetchUsageForAccounts, showNotification, t]);

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteTarget({ type: 'single', id });
    setDeleteModalOpen(true);
  }, []);

  const handleBatchDeleteClick = useCallback(() => {
    if (selectedIds.length === 0) return;
    setDeleteTarget({ type: 'batch' });
    setDeleteModalOpen(true);
  }, [selectedIds]);

  const handleDeleteExpired = useCallback(() => {
    if (stats.expired === 0) return;
    setDeleteTarget({ type: 'expired' });
    setDeleteModalOpen(true);
  }, [stats.expired]);

  const handleDeleteAbnormal = useCallback(() => {
    const abnormalCount = stats.expired + stats.banned;
    if (abnormalCount === 0) return;
    setDeleteTarget({ type: 'abnormal' });
    setDeleteModalOpen(true);
  }, [stats.expired, stats.banned]);

  const handleFilterByStatus = useCallback((status: StatusFilter) => {
    setStatusFilter(status);
    setSelectedIds([]);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'single' && deleteTarget.id) {
        await kiroApi.deleteAccount(deleteTarget.id);
        showNotification(t('kiro.notification.deleted'), 'success');
      } else if (deleteTarget.type === 'batch') {
        await kiroApi.deleteAccounts(selectedIds);
        showNotification(t('kiro.notification.batchDeleted', { count: selectedIds.length }), 'success');
        setSelectedIds([]);
      } else if (deleteTarget.type === 'expired') {
        const expiredIds = accounts.filter((a) => a.status === 'expired').map((a) => a.id);
        await kiroApi.deleteAccounts(expiredIds);
        showNotification(t('kiro.notification.batchDeleted', { count: expiredIds.length }), 'success');
      } else if (deleteTarget.type === 'abnormal') {
        const abnormalIds = accounts.filter((a) => a.status === 'expired' || a.status === 'banned').map((a) => a.id);
        await kiroApi.deleteAccounts(abnormalIds);
        showNotification(t('kiro.notification.batchDeleted', { count: abnormalIds.length }), 'success');
      }
      setStatusFilter('all');
      await loadAccounts(true);
    } catch {
      showNotification(t('common.error'), 'error');
    } finally {
      setDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, selectedIds, accounts, loadAccounts, showNotification, t]);

  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) =>
      selected ? [...prev, id] : prev.filter((i) => i !== id)
    );
  }, []);

  const handleSelectAll = useCallback((selected: boolean) => {
    setSelectedIds(selected ? filteredAccounts.map((a) => a.id) : []);
  }, [filteredAccounts]);

  const handleImportComplete = useCallback(async () => {
    await loadAccounts(true);
  }, [loadAccounts]);

  const getDeleteModalMessage = () => {
    if (!deleteTarget) return '';
    switch (deleteTarget.type) {
      case 'single':
        return t('kiro.confirm.delete');
      case 'batch':
        return t('kiro.confirm.batchDelete', { count: selectedIds.length });
      case 'expired':
        return t('kiro.confirm.deleteExpired', { 
          count: stats.expired,
          defaultValue: `Are you sure you want to delete all ${stats.expired} expired accounts?`
        });
      case 'abnormal':
        return t('kiro.confirm.deleteAbnormal', { 
          count: stats.expired + stats.banned,
          defaultValue: `Are you sure you want to delete all ${stats.expired + stats.banned} abnormal accounts?`
        });
      default:
        return '';
    }
  };

  return (
    <div className={styles.container}>
      <KiroStatsHeader
        stats={stats}
        accounts={accounts}
        onFilterByStatus={handleFilterByStatus}
        onDeleteExpired={handleDeleteExpired}
        onDeleteAbnormal={handleDeleteAbnormal}
        activeFilter={statusFilter}
      />

      {statusFilter !== 'all' && (
        <div className={styles.filterBanner}>
          <span>
            {t('kiro.filter.showing', { 
              status: statusFilter,
              count: filteredAccounts.length,
              defaultValue: `Showing ${filteredAccounts.length} ${statusFilter} accounts`
            })}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setStatusFilter('all')}>
            {t('kiro.filter.clearFilter', { defaultValue: 'Clear Filter' })}
          </Button>
        </div>
      )}

      <div className={styles.listSection}>
        <KiroAccountList
          accounts={filteredAccounts}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onRefresh={handleRefresh}
          onDelete={handleDeleteClick}
          onBatchDelete={handleBatchDeleteClick}
          onViewDetails={setDetailsModal}
          onRefreshAll={handleRefreshAll}
          onImport={() => setImportModalOpen(true)}
          refreshingId={refreshingId}
          refreshingAll={refreshingAll}
          loading={loading}
        />
      </div>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={t('common.confirm')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDeleteConfirm}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{getDeleteModalMessage()}</p>
      </Modal>

      <Modal
        open={!!detailsModal}
        onClose={() => setDetailsModal(null)}
        title={t('kiro.actions.viewDetails')}
      >
        {detailsModal && (
          <div className={styles.detailsContent}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t('kiro.account.email')}:</span>
              <span className={styles.detailValue}>{detailsModal.email}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t('kiro.account.provider')}:</span>
              <span className={styles.detailValue}>{detailsModal.provider}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>{t('kiro.account.status')}:</span>
              <span className={styles.detailValue}>{detailsModal.status}</span>
            </div>
            {detailsModal.label && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Label:</span>
                <span className={styles.detailValue}>{detailsModal.label}</span>
              </div>
            )}
            {detailsModal.expiresAt && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>{t('kiro.account.expiresAt')}:</span>
                <span className={styles.detailValue}>{detailsModal.expiresAt}</span>
              </div>
            )}
            {detailsModal.region && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Region:</span>
                <span className={styles.detailValue}>{detailsModal.region}</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      <KiroImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}
