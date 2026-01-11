import { useState } from 'react';
import { useThemeStore } from '@/stores';
import type { KiroAccountItem } from '@/types';
import { getQuota, getUsed, getUsagePercent, isProPlus, isPro, getSubPlan } from '@/utils/kiro';
import styles from './KiroAccountCard.module.scss';

interface KiroAccountCardProps {
  account: KiroAccountItem;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onRefresh?: () => void;
  onDelete?: () => void;
  onViewDetails?: () => void;
  refreshing?: boolean;
}

export function KiroAccountCard({
  account,
  selected = false,
  onSelect,
  onRefresh,
  onDelete,
  onViewDetails,
  refreshing = false,
}: KiroAccountCardProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);

  const quota = getQuota(account);
  const used = getUsed(account);
  const percent = getUsagePercent(used, quota);
  const subPlan = getSubPlan(account) || (isProPlus(account) ? 'Pro+' : isPro(account) ? 'Pro' : 'Free');

  const isExpired = account.status === 'expired';
  const isBanned = account.status === 'banned';
  const isActive = account.status === 'active';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(account.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const getStatusInfo = () => {
    if (isActive) return { label: 'ACTIVE', class: styles.active };
    if (isBanned) return { label: 'BANNED', class: styles.banned };
    if (isExpired) return { label: 'EXPIRED', class: styles.expired };
    return { label: 'UNKNOWN', class: styles.unknown };
  };

  const getPlanClass = () => {
    if (isProPlus(account)) return styles.proPlus;
    if (isPro(account)) return styles.pro;
    return styles.free;
  };

  const getProviderClass = () => {
    const p = account.provider?.toLowerCase() || '';
    if (p === 'google') return styles.google;
    if (p === 'github') return styles.github;
    if (p === 'builderid') return styles.builderid;
    return styles.default;
  };

  const getUsageLevel = () => {
    if (percent > 80) return 'critical';
    if (percent > 50) return 'warning';
    return 'normal';
  };

  const formatNum = (n: number) => {
    if (n < 0) return '-';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n * 10) / 10);
  };

  const status = getStatusInfo();

  return (
    <div
      className={`${styles.card} ${isDark ? styles.dark : ''} ${selected ? styles.selected : ''} ${status.class}`}
      onClick={() => onViewDetails?.()}
    >
      <div className={styles.cardHeader}>
        <label className={styles.checkArea} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect?.(e.target.checked)}
          />
          <span className={styles.checkmark} />
        </label>

        <div className={`${styles.statusDot} ${status.class}`} title={status.label} />

        <div className={styles.planBadge}>
          <span className={getPlanClass()}>{subPlan}</span>
        </div>
      </div>

      <div className={styles.identity}>
        <div className={`${styles.providerIcon} ${getProviderClass()}`}>
          {account.provider === 'Google' && (
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {account.provider === 'Github' && (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          )}
          {account.provider === 'BuilderId' && (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          )}
          {!['Google', 'Github', 'BuilderId'].includes(account.provider || '') && (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
          )}
        </div>
        <div className={styles.emailBlock}>
          <span className={styles.email} title={account.email}>{account.email}</span>
          <button className={styles.copyBtn} onClick={handleCopy} title="Copy email">
            {copied ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className={styles.quotaBlock}>
        <div className={styles.quotaHeader}>
          <span className={styles.quotaLabel}>QUOTA</span>
          <span className={`${styles.quotaPercent} ${styles[getUsageLevel()]}`}>
            {percent >= 0 ? `${Math.round(percent)}%` : '-'}
          </span>
        </div>
        <div className={styles.quotaBar}>
          <div
            className={`${styles.quotaFill} ${styles[getUsageLevel()]}`}
            style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
          />
        </div>
        <div className={styles.quotaStats}>
          <span>{formatNum(used)} used</span>
          <span>{formatNum(quota - used)} left</span>
        </div>
      </div>

      <div className={styles.cardFooter} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.actionBtn}
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={refreshing ? styles.spin : ''}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
        </button>
        <button
          className={styles.actionBtn}
          onClick={onViewDetails}
          title="Details"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7z"/>
          </svg>
        </button>
        <button
          className={`${styles.actionBtn} ${styles.danger}`}
          onClick={onDelete}
          title="Delete"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
