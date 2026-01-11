import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores';
import type { KiroAccountItem } from '@/types';
import { getQuota, getUsed, getUsagePercent, isProPlus, isPro, getSubPlan } from '@/utils/kiro';
import styles from './KiroAccountTable.module.scss';

interface KiroAccountTableProps {
  accounts: KiroAccountItem[];
  selectedIds: string[];
  onSelect: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onViewDetails: (account: KiroAccountItem) => void;
  refreshingId?: string | null;
}

export function KiroAccountTable({
  accounts,
  selectedIds,
  onSelect,
  onSelectAll,
  onRefresh,
  onDelete,
  onViewDetails,
  refreshingId,
}: KiroAccountTableProps) {
  const { t } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const allSelected = accounts.length > 0 && accounts.every((a) => selectedIds.includes(a.id));

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getStatusClass = (status: string) => {
    if (status === 'active') return styles.statusActive;
    if (status === 'banned') return styles.statusBanned;
    if (status === 'expired') return styles.statusExpired;
    return styles.statusUnknown;
  };

  const getSubClass = (account: KiroAccountItem) => {
    if (isProPlus(account)) return styles.subProPlus;
    if (isPro(account)) return styles.subPro;
    return styles.subFree;
  };

  return (
    <div className={`${styles.tableContainer} ${isDark ? styles.dark : ''}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.checkboxCol}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
            <th>{t('kiro.table.email')}</th>
            <th>{t('kiro.table.label')}</th>
            <th>{t('kiro.table.provider')}</th>
            <th>{t('kiro.table.subscription')}</th>
            <th>{t('kiro.table.quota')}</th>
            <th>{t('kiro.table.status')}</th>
            <th>{t('kiro.table.machineId')}</th>
            <th>{t('kiro.table.expiresAt')}</th>
            <th>{t('kiro.table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const quota = getQuota(account);
            const used = getUsed(account);
            const percent = getUsagePercent(used, quota);
            const subPlan = getSubPlan(account) || (isProPlus(account) ? 'Pro+' : isPro(account) ? 'Pro' : 'Free');
            const isRefreshing = refreshingId === account.id;

            return (
              <tr key={account.id} className={selectedIds.includes(account.id) ? styles.selected : ''}>
                <td className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(account.id)}
                    onChange={(e) => onSelect(account.id, e.target.checked)}
                  />
                </td>
                <td className={styles.emailCol}>
                  <div className={styles.emailWrapper}>
                    <span className={styles.email}>{account.email}</span>
                    <button
                      className={styles.copyBtn}
                      onClick={() => handleCopy(account.email, account.id)}
                    >
                      {copiedId === account.id ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                </td>
                <td className={styles.labelCol}>
                  <span className={styles.label}>{account.label || '-'}</span>
                </td>
                <td>
                  <span className={styles.provider}>{account.provider}</span>
                </td>
                <td>
                  <span className={`${styles.subBadge} ${getSubClass(account)}`}>{subPlan}</span>
                </td>
                <td className={styles.quotaCol}>
                  <div className={styles.quotaWrapper}>
                    <div className={styles.quotaText}>
                      <span>{Math.round(used * 100) / 100}</span>
                      <span className={styles.quotaSeparator}>/</span>
                      <span>{quota}</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div
                        className={`${styles.progressFill} ${percent > 80 ? styles.red : percent > 50 ? styles.yellow : styles.green}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${getStatusClass(account.status)}`}>
                    {account.status === 'active' ? t('kiro.status.active') :
                     account.status === 'banned' ? t('kiro.status.banned') :
                     account.status === 'expired' ? t('kiro.status.expired') :
                     t('kiro.status.unknown')}
                  </span>
                </td>
                <td className={styles.machineIdCol}>
                  <span className={styles.machineId}>
                    {account.clientIdHash ? account.clientIdHash.slice(0, 8) + '...' : '-'}
                  </span>
                </td>
                <td className={styles.expiresCol}>
                  {account.expiresAt ? (
                    <span className={account.status === 'expired' ? styles.expiredText : ''}>
                      {account.expiresAt}
                    </span>
                  ) : '-'}
                </td>
                <td className={styles.actionsCol}>
                  <div className={styles.actions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => onRefresh(account.id)}
                      disabled={isRefreshing}
                      title={t('kiro.actions.refresh')}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={isRefreshing ? styles.spinning : ''}
                      >
                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                      </svg>
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => onViewDetails(account)}
                      title={t('kiro.actions.viewDetails')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => onDelete(account.id)}
                      title={t('kiro.actions.delete')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
