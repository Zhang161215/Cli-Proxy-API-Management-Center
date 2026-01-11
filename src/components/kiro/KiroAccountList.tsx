import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { KiroAccountCard } from './KiroAccountCard';
import { KiroAccountTable } from './KiroAccountTable';
import type { KiroAccountItem } from '@/types';
import styles from './KiroAccountList.module.scss';

interface KiroAccountListProps {
  accounts: KiroAccountItem[];
  selectedIds: string[];
  onSelect: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onBatchDelete: () => void;
  onViewDetails: (account: KiroAccountItem) => void;
  onRefreshAll?: () => void;
  onImport?: () => void;
  refreshingId?: string | null;
  refreshingAll?: boolean;
  loading?: boolean;
}

type ViewMode = 'card' | 'table';

export function KiroAccountList({
  accounts,
  selectedIds,
  onSelect,
  onSelectAll,
  onRefresh,
  onDelete,
  onBatchDelete,
  onViewDetails,
  onRefreshAll,
  onImport,
  refreshingId,
  refreshingAll = false,
  loading = false,
}: KiroAccountListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === 'dark';

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const pageSize = viewMode === 'card' ? 15 : 20;

  const filteredAccounts = useMemo(() => {
    if (!searchTerm.trim()) return accounts;
    const term = searchTerm.toLowerCase();
    return accounts.filter(
      (a) =>
        a.email.toLowerCase().includes(term) ||
        (a.label && a.label.toLowerCase().includes(term))
    );
  }, [accounts, searchTerm]);

  const totalPages = Math.ceil(filteredAccounts.length / pageSize) || 1;
  const paginatedAccounts = useMemo(
    () => filteredAccounts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredAccounts, currentPage, pageSize]
  );

  const allSelected = paginatedAccounts.length > 0 && paginatedAccounts.every((a) => selectedIds.includes(a.id));

  const handleAddAccount = () => {
    navigate('/oauth?provider=kiro');
  };

  if (loading) {
    return (
      <div className={`${styles.loading} ${isDark ? styles.dark : ''}`}>
        <div className={styles.spinner} />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <EmptyState
          title={t('kiro.empty.title')}
          description={t('kiro.empty.desc')}
        />
        <Button className={styles.addButton} onClick={handleAddAccount}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('kiro.actions.addAccount')}
        </Button>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${isDark ? styles.dark : ''}`}>
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <div className={styles.searchWrapper}>
            <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder={t('kiro.search.placeholder')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className={styles.searchInput}
            />
          </div>
        </div>
        <div className={styles.right}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'card' ? styles.active : ''}`}
              onClick={() => setViewMode('card')}
              title={t('kiro.view.card')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'table' ? styles.active : ''}`}
              onClick={() => setViewMode('table')}
              title={t('kiro.view.table')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>

          {selectedIds.length > 0 && (
            <Button variant="danger" size="sm" onClick={onBatchDelete} className={styles.toolbarBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              {t('kiro.actions.batchDelete')} ({selectedIds.length})
            </Button>
          )}
          
          <Button variant="secondary" size="sm" onClick={handleAddAccount} className={styles.toolbarBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('kiro.actions.addAccount')}
          </Button>
          
          {onImport && (
            <Button variant="secondary" size="sm" onClick={onImport} className={styles.toolbarBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {t('kiro.actions.import')}
            </Button>
          )}
          
          {onRefreshAll && (
            <Button 
              variant="primary" 
              size="sm" 
              onClick={onRefreshAll} 
              disabled={refreshingAll}
              className={styles.toolbarBtn}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={refreshingAll ? styles.spinning : ''}
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              {t('kiro.actions.refreshAll')}
            </Button>
          )}
          
          <label className={styles.selectAll}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectAll(e.target.checked)}
            />
            <span>{t('common.select_all', { defaultValue: 'Select All' })}</span>
          </label>
        </div>
      </div>

      {filteredAccounts.length === 0 ? (
        <div className={styles.searchEmpty}>
          <p>{t('kiro.search.empty')}</p>
        </div>
      ) : (
        <>
          {viewMode === 'card' ? (
            <div className={styles.grid}>
              {paginatedAccounts.map((account) => (
                <KiroAccountCard
                  key={account.id}
                  account={account}
                  selected={selectedIds.includes(account.id)}
                  onSelect={(selected) => onSelect(account.id, selected)}
                  onRefresh={() => onRefresh(account.id)}
                  onDelete={() => onDelete(account.id)}
                  onViewDetails={() => onViewDetails(account)}
                  refreshing={refreshingId === account.id}
                />
              ))}
            </div>
          ) : (
            <KiroAccountTable
              accounts={paginatedAccounts}
              selectedIds={selectedIds}
              onSelect={onSelect}
              onSelectAll={onSelectAll}
              onRefresh={onRefresh}
              onDelete={onDelete}
              onViewDetails={onViewDetails}
              refreshingId={refreshingId}
            />
          )}

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                {t('auth_files.pagination_prev')}
              </Button>
              <span className={styles.pageInfo}>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                {t('auth_files.pagination_next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
