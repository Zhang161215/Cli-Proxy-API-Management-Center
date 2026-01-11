import { useState, useCallback, useRef, useEffect, type ChangeEvent, type DragEvent } from 'react';
import { useThemeStore, useNotificationStore } from '@/stores';
import { Modal } from '@/components/ui/Modal';
import { kiroApi } from '@/services/api/kiro';
import type { KiroImportAccountData, KiroBatchImportResult } from '@/types';
import styles from './KiroImportModal.module.scss';

interface KiroImportModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParseResult {
  valid: KiroImportAccountData[];
  invalid: { index: number; reason: string; email?: string }[];
}

type ImportPhase = 'upload' | 'preview' | 'importing' | 'complete';

export function KiroImportModal({ open, onClose, onImportComplete }: KiroImportModalProps) {
  const theme = useThemeStore((state) => state.theme);
  const { showNotification } = useNotificationStore();
  const isDark = theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [jsonText, setJsonText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [importResults, setImportResults] = useState<KiroBatchImportResult[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setPhase('upload');
        setJsonText('');
        setParseResult(null);
        setProgress(0);
        setImportResults(null);
        setFileName(null);
      }, 300);
    }
  }, [open]);

  const parseJson = useCallback((text: string): ParseResult | null => {
    if (!text.trim()) return null;
    try {
      const data = JSON.parse(text);
      const accounts = Array.isArray(data) ? data : [data];
      const valid: KiroImportAccountData[] = [];
      const invalid: { index: number; reason: string; email?: string }[] = [];

      accounts.forEach((account, index) => {
        const email = account.email || `#${index + 1}`;
        if (!account.refreshToken) {
          invalid.push({ index, reason: 'Missing refreshToken', email });
          return;
        }
        if (!account.refreshToken.startsWith('aor')) {
          invalid.push({ index, reason: 'Invalid refreshToken', email });
          return;
        }
        valid.push(account);
      });
      return { valid, invalid };
    } catch {
      return { valid: [], invalid: [{ index: -1, reason: 'Invalid JSON format' }] };
    }
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setJsonText(text);
      const result = parseJson(text);
      setParseResult(result);
      if (result && result.valid.length > 0) {
        setPhase('preview');
      }
    };
    reader.readAsText(file);
  }, [parseJson]);

  const handleFileInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handlePaste = useCallback((text: string) => {
    setJsonText(text);
    const result = parseJson(text);
    setParseResult(result);
    if (result && result.valid.length > 0) {
      setPhase('preview');
    }
  }, [parseJson]);

  const handleImport = useCallback(async () => {
    if (!parseResult?.valid.length) return;
    
    setPhase('importing');
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + Math.random() * 15, 90));
    }, 200);

    try {
      const response = await kiroApi.importKiroAccounts(parseResult.valid);
      clearInterval(progressInterval);
      setProgress(100);
      
      if (!response || typeof response !== 'object') {
        throw new Error('服务器返回了无效的响应');
      }
      
      const results = response.results || [];
      const successNum = response.success ?? results.filter((r: KiroBatchImportResult) => r.status === 'success').length;
      const duplicateNum = response.duplicate ?? results.filter((r: KiroBatchImportResult) => r.status === 'duplicate').length;
      
      setImportResults(results);
      setPhase('complete');
      
      if (successNum > 0) {
        showNotification(`成功导入 ${successNum} 个账号`, 'success');
        onImportComplete();
      } else if (duplicateNum > 0) {
        showNotification(`${duplicateNum} 个账号已存在`, 'warning');
      } else {
        showNotification('导入完成', 'info');
      }
    } catch (error) {
      clearInterval(progressInterval);
      setProgress(0);
      setPhase('preview');
      const msg = error instanceof Error ? error.message : '导入失败';
      showNotification(msg, 'error');
      console.error('Import error:', error);
    }
  }, [parseResult, onImportComplete, showNotification]);

  const handleBack = useCallback(() => {
    setPhase('upload');
    setParseResult(null);
    setFileName(null);
  }, []);

  const successCount = importResults?.filter(r => r.status === 'success').length || 0;
  const duplicateCount = importResults?.filter(r => r.status === 'duplicate').length || 0;
  const failedCount = importResults?.filter(r => r.status === 'failed').length || 0;

  return (
    <Modal open={open} title="" onClose={onClose} width={520}>
      <div className={`${styles.container} ${isDark ? styles.dark : ''}`}>
        
        {/* Phase: Upload */}
        {phase === 'upload' && (
          <div className={styles.uploadPhase}>
            <div className={styles.header}>
              <div className={styles.iconWrapper}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <h2 className={styles.title}>导入 Kiro 账号</h2>
              <p className={styles.subtitle}>支持 kiro-account-manager 导出的 JSON 格式</p>
            </div>

            <div
              className={`${styles.dropZone} ${dragOver ? styles.active : ''}`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.dropContent}>
                <div className={styles.dropIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <span className={styles.dropLabel}>拖拽文件到此处</span>
                <span className={styles.dropHint}>或点击选择 .json 文件</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileInputChange}
                hidden
              />
            </div>

            <div className={styles.divider}>
              <span>或者粘贴 JSON</span>
            </div>

            <textarea
              className={styles.textarea}
              placeholder='[{"refreshToken": "aor...", "email": "..."}]'
              value={jsonText}
              onChange={(e) => handlePaste(e.target.value)}
              rows={4}
            />
          </div>
        )}

        {/* Phase: Preview */}
        {phase === 'preview' && parseResult && (
          <div className={styles.previewPhase}>
            <div className={styles.header}>
              <div className={styles.iconWrapper + ' ' + styles.success}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className={styles.title}>准备就绪</h2>
              <p className={styles.subtitle}>
                {fileName && <span className={styles.fileName}>{fileName}</span>}
              </p>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.statBox + ' ' + styles.valid}>
                <span className={styles.statNum}>{parseResult.valid.length}</span>
                <span className={styles.statLabel}>可导入</span>
              </div>
              {parseResult.invalid.length > 0 && (
                <div className={styles.statBox + ' ' + styles.invalid}>
                  <span className={styles.statNum}>{parseResult.invalid.length}</span>
                  <span className={styles.statLabel}>无效</span>
                </div>
              )}
            </div>

            {parseResult.invalid.length > 0 && (
              <div className={styles.errorSection}>
                <div className={styles.errorTitle}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  无效账号
                </div>
                <div className={styles.errorList}>
                  {parseResult.invalid.slice(0, 3).map((err, i) => (
                    <div key={i} className={styles.errorItem}>
                      <span>{err.email}</span>
                      <span className={styles.errorReason}>{err.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <button className={styles.btnSecondary} onClick={handleBack}>
                返回
              </button>
              <button className={styles.btnPrimary} onClick={handleImport}>
                导入 {parseResult.valid.length} 个账号
              </button>
            </div>
          </div>
        )}

        {/* Phase: Importing */}
        {phase === 'importing' && (
          <div className={styles.importingPhase}>
            <div className={styles.header}>
              <div className={styles.spinnerWrapper}>
                <div className={styles.spinner} />
              </div>
              <h2 className={styles.title}>正在导入...</h2>
              <p className={styles.subtitle}>请稍候，正在处理账号数据</p>
            </div>

            <div className={styles.progressWrapper}>
              <div className={styles.progressTrack}>
                <div className={styles.progressBar} style={{ width: `${progress}%` }} />
              </div>
              <span className={styles.progressText}>{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        {/* Phase: Complete */}
        {phase === 'complete' && (
          <div className={styles.completePhase}>
            <div className={styles.header}>
              <div className={styles.iconWrapper + ' ' + (successCount > 0 ? styles.success : styles.warning)}>
                {successCount > 0 ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
              </div>
              <h2 className={styles.title}>导入完成</h2>
            </div>

            <div className={styles.resultGrid}>
              <div className={styles.resultItem}>
                <span className={styles.resultNum + ' ' + styles.successText}>{successCount}</span>
                <span className={styles.resultLabel}>成功</span>
              </div>
              <div className={styles.resultItem}>
                <span className={styles.resultNum + ' ' + styles.warningText}>{duplicateCount}</span>
                <span className={styles.resultLabel}>重复</span>
              </div>
              <div className={styles.resultItem}>
                <span className={styles.resultNum + ' ' + styles.errorText}>{failedCount}</span>
                <span className={styles.resultLabel}>失败</span>
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.btnPrimary + ' ' + styles.full} onClick={onClose}>
                完成
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
