import { useMemo } from 'react';
import { useThemeStore } from '@/stores';
import { Button } from '@/components/ui/Button';
import type { KiroAccountStats, KiroAccountItem } from '@/types';
import styles from './KiroStatsHeader.module.scss';

interface KiroStatsHeaderProps {
  stats: KiroAccountStats;
  accounts?: KiroAccountItem[];
  onFilterByStatus?: (status: 'all' | 'active' | 'abnormal' | 'expired' | 'banned') => void;
  onDeleteExpired?: () => void;
  onDeleteAbnormal?: () => void;
  activeFilter?: string;
}

export function KiroStatsHeader({
  stats,
  accounts = [],
  onFilterByStatus,
  onDeleteExpired,
  onDeleteAbnormal,
  activeFilter = 'all',
}: KiroStatsHeaderProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const abnormalCount = stats.expired + stats.banned;

  const providerDist = useMemo(() => {
    const dist: Record<string, number> = {};
    accounts.forEach((a) => {
      const p = a.provider || 'Unknown';
      dist[p] = (dist[p] || 0) + 1;
    });
    return Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [accounts]);

  const formatNum = (n: number) => {
    if (n < 0) return '-';
    if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  };

  const getUsageLevel = () => {
    if (stats.usagePercent > 90) return 'critical';
    if (stats.usagePercent > 70) return 'warning';
    return 'normal';
  };

  const handleFilter = (status: 'all' | 'active' | 'abnormal') => {
    onFilterByStatus?.(activeFilter === status ? 'all' : status);
  };

  const usageLevel = getUsageLevel();
  const circumference = 2 * Math.PI * 40;
  const strokeDasharray = `${(stats.usagePercent / 100) * circumference} ${circumference}`;

  return (
    <div className={`${styles.panel} ${isDark ? styles.dark : ''}`}>
      <div className={styles.grid}>
        <div className={styles.cell}>
          <div className={styles.cellHeader}>
            <span className={styles.cellLabel}>ACCOUNTS</span>
          </div>
          <div className={styles.statGroup}>
            <button
              className={`${styles.statCard} ${activeFilter === 'all' ? styles.selected : ''}`}
              onClick={() => handleFilter('all')}
            >
              <span className={styles.statValue}>{stats.total}</span>
              <span className={styles.statName}>Total</span>
            </button>
            <button
              className={`${styles.statCard} ${styles.success} ${activeFilter === 'active' ? styles.selected : ''}`}
              onClick={() => handleFilter('active')}
            >
              <span className={styles.statValue}>{stats.active}</span>
              <span className={styles.statName}>Active</span>
            </button>
            <button
              className={`${styles.statCard} ${styles.danger} ${activeFilter === 'abnormal' ? styles.selected : ''}`}
              onClick={() => handleFilter('abnormal')}
            >
              <span className={styles.statValue}>{abnormalCount}</span>
              <span className={styles.statName}>Abnormal</span>
            </button>
          </div>
        </div>

        <div className={styles.cell}>
          <div className={styles.cellHeader}>
            <span className={styles.cellLabel}>QUOTA USAGE</span>
            <span className={`${styles.badge} ${styles[usageLevel]}`}>
              {stats.usagePercent.toFixed(1)}%
            </span>
          </div>
          <div className={styles.quotaContent}>
            <div className={styles.ringWrapper}>
              <svg className={styles.ring} viewBox="0 0 100 100">
                <circle className={styles.ringTrack} cx="50" cy="50" r="40" />
                <circle
                  className={`${styles.ringProgress} ${styles[usageLevel]}`}
                  cx="50"
                  cy="50"
                  r="40"
                  strokeDasharray={strokeDasharray}
                />
              </svg>
              <div className={styles.ringInner}>
                <span className={styles.ringValue}>{formatNum(stats.remaining)}</span>
                <span className={styles.ringLabel}>left</span>
              </div>
            </div>
            <div className={styles.quotaMeta}>
              <div className={styles.quotaLine}>
                <span className={styles.quotaKey}>Used</span>
                <span className={styles.quotaVal}>{formatNum(stats.totalUsed)}</span>
              </div>
              <div className={styles.quotaLine}>
                <span className={styles.quotaKey}>Total</span>
                <span className={styles.quotaVal}>{formatNum(stats.totalQuota)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.cell}>
          <div className={styles.cellHeader}>
            <span className={styles.cellLabel}>PLANS</span>
          </div>
          <div className={styles.tagList}>
            {stats.proPlus > 0 && (
              <div className={`${styles.tag} ${styles.proPlus}`}>
                <span className={styles.tagCount}>{stats.proPlus}</span>
                <span className={styles.tagName}>Pro+</span>
              </div>
            )}
            {stats.pro > 0 && (
              <div className={`${styles.tag} ${styles.pro}`}>
                <span className={styles.tagCount}>{stats.pro}</span>
                <span className={styles.tagName}>Pro</span>
              </div>
            )}
            {stats.free > 0 && (
              <div className={`${styles.tag} ${styles.free}`}>
                <span className={styles.tagCount}>{stats.free}</span>
                <span className={styles.tagName}>Free</span>
              </div>
            )}
            {stats.proPlus === 0 && stats.pro === 0 && stats.free === 0 && (
              <span className={styles.empty}>-</span>
            )}
          </div>
        </div>

        <div className={styles.cell}>
          <div className={styles.cellHeader}>
            <span className={styles.cellLabel}>PROVIDERS</span>
          </div>
          <div className={styles.tagList}>
            {providerDist.length > 0 ? (
              providerDist.map(([name, count]) => (
                <div key={name} className={`${styles.tag} ${styles[name.toLowerCase()] || ''}`}>
                  <span className={styles.tagCount}>{count}</span>
                  <span className={styles.tagName}>{name}</span>
                </div>
              ))
            ) : (
              <span className={styles.empty}>-</span>
            )}
          </div>
        </div>
      </div>

      {abnormalCount > 0 && (onDeleteExpired || onDeleteAbnormal) && (
        <div className={styles.actionsBar}>
          <span className={styles.actionsLabel}>Quick Actions</span>
          <div className={styles.actionsBtns}>
            {stats.expired > 0 && onDeleteExpired && (
              <Button variant="danger" size="sm" onClick={onDeleteExpired}>
                Delete {stats.expired} Expired
              </Button>
            )}
            {abnormalCount > 0 && onDeleteAbnormal && (
              <Button variant="danger" size="sm" onClick={onDeleteAbnormal}>
                Delete All Abnormal
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
