import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useNotificationStore, useThemeStore } from '@/stores';
import { oauthApi, type OAuthProvider, type IFlowCookieAuthResponse } from '@/services/api/oauth';
import { vertexApi, type VertexImportResponse } from '@/services/api/vertex';
import { kiroApi } from '@/services/api/kiro';
import styles from './OAuthPage.module.scss';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconIflow from '@/assets/icons/iflow.svg';
import iconVertex from '@/assets/icons/vertex.svg';
import iconKiro from '@/assets/icons/kiro.svg';

interface ProviderState {
  url?: string;
  state?: string;
  status?: 'idle' | 'waiting' | 'success' | 'error';
  error?: string;
  polling?: boolean;
  projectId?: string;
  projectIdError?: string;
  callbackUrl?: string;
  callbackSubmitting?: boolean;
  callbackStatus?: 'success' | 'error';
  callbackError?: string;
}

interface IFlowCookieState {
  cookie: string;
  loading: boolean;
  result?: IFlowCookieAuthResponse;
  error?: string;
  errorType?: 'error' | 'warning';
}

interface VertexImportResult {
  projectId?: string;
  email?: string;
  location?: string;
  authFile?: string;
}

interface VertexImportState {
  file?: File;
  fileName: string;
  location: string;
  loading: boolean;
  error?: string;
  result?: VertexImportResult;
}

type KiroAuthProvider = 'google' | 'github' | 'aws';

interface KiroOAuthState {
  url?: string;
  state?: string;
  status: 'idle' | 'waiting' | 'success' | 'error' | 'device_code' | 'auth_url';
  error?: string;
  polling?: boolean;
  activeProvider?: KiroAuthProvider;
  userCode?: string;
  verificationUrl?: string;
  authUrl?: string;
}

const PROVIDERS: { id: OAuthProvider; titleKey: string; hintKey: string; urlLabelKey: string; icon: string | { light: string; dark: string } }[] = [
  { id: 'codex', titleKey: 'auth_login.codex_oauth_title', hintKey: 'auth_login.codex_oauth_hint', urlLabelKey: 'auth_login.codex_oauth_url_label', icon: { light: iconOpenaiLight, dark: iconOpenaiDark } },
  { id: 'anthropic', titleKey: 'auth_login.anthropic_oauth_title', hintKey: 'auth_login.anthropic_oauth_hint', urlLabelKey: 'auth_login.anthropic_oauth_url_label', icon: iconClaude },
  { id: 'antigravity', titleKey: 'auth_login.antigravity_oauth_title', hintKey: 'auth_login.antigravity_oauth_hint', urlLabelKey: 'auth_login.antigravity_oauth_url_label', icon: iconAntigravity },
  { id: 'gemini-cli', titleKey: 'auth_login.gemini_cli_oauth_title', hintKey: 'auth_login.gemini_cli_oauth_hint', urlLabelKey: 'auth_login.gemini_cli_oauth_url_label', icon: iconGemini },
  { id: 'qwen', titleKey: 'auth_login.qwen_oauth_title', hintKey: 'auth_login.qwen_oauth_hint', urlLabelKey: 'auth_login.qwen_oauth_url_label', icon: iconQwen }
];

const CALLBACK_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli'];
const getProviderI18nPrefix = (provider: OAuthProvider) => provider.replace('-', '_');
const getAuthKey = (provider: OAuthProvider, suffix: string) =>
  `auth_login.${getProviderI18nPrefix(provider)}_${suffix}`;

const getIcon = (icon: string | { light: string; dark: string }, theme: 'light' | 'dark') => {
  return typeof icon === 'string' ? icon : icon[theme];
};

export function OAuthPage() {
  const { t } = useTranslation();
  const { showNotification } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [states, setStates] = useState<Record<OAuthProvider, ProviderState>>({} as Record<OAuthProvider, ProviderState>);
  const [iflowCookie, setIflowCookie] = useState<IFlowCookieState>({ cookie: '', loading: false });
  const [vertexState, setVertexState] = useState<VertexImportState>({
    fileName: '',
    location: '',
    loading: false
  });
  const [kiroState, setKiroState] = useState<KiroOAuthState>({ status: 'idle' });
  const timers = useRef<Record<string, number>>({});
  const vertexFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach((timer) => window.clearInterval(timer));
    };
  }, []);

  const updateProviderState = (provider: OAuthProvider, next: Partial<ProviderState>) => {
    setStates((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? {}), ...next }
    }));
  };

  const startPolling = (provider: OAuthProvider, state: string) => {
    if (timers.current[provider]) {
      clearInterval(timers.current[provider]);
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await oauthApi.getAuthStatus(state);
        if (res.status === 'ok') {
          updateProviderState(provider, { status: 'success', polling: false });
          showNotification(t(getAuthKey(provider, 'oauth_status_success')), 'success');
          window.clearInterval(timer);
          delete timers.current[provider];
        } else if (res.status === 'error') {
          updateProviderState(provider, { status: 'error', error: res.error, polling: false });
          showNotification(
            `${t(getAuthKey(provider, 'oauth_status_error'))} ${res.error || ''}`,
            'error'
          );
          window.clearInterval(timer);
          delete timers.current[provider];
        }
      } catch (err: any) {
        updateProviderState(provider, { status: 'error', error: err?.message, polling: false });
        window.clearInterval(timer);
        delete timers.current[provider];
      }
    }, 3000);
    timers.current[provider] = timer;
  };

  const startAuth = async (provider: OAuthProvider) => {
    const projectId = provider === 'gemini-cli' ? (states[provider]?.projectId || '').trim() : undefined;
    // 项目 ID 现在是可选的，如果不输入将自动选择第一个可用项目
    if (provider === 'gemini-cli') {
      updateProviderState(provider, { projectIdError: undefined });
    }
    updateProviderState(provider, {
      status: 'waiting',
      polling: true,
      error: undefined,
      callbackStatus: undefined,
      callbackError: undefined,
      callbackUrl: ''
    });
    try {
      const res = await oauthApi.startAuth(
        provider,
        provider === 'gemini-cli' ? { projectId: projectId || undefined } : undefined
      );
      updateProviderState(provider, { url: res.url, state: res.state, status: 'waiting', polling: true });
      if (res.state) {
        startPolling(provider, res.state);
      }
    } catch (err: any) {
      updateProviderState(provider, { status: 'error', error: err?.message, polling: false });
      showNotification(`${t(getAuthKey(provider, 'oauth_start_error'))} ${err?.message || ''}`, 'error');
    }
  };

  const copyLink = async (url?: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showNotification(t('notification.link_copied'), 'success');
    } catch {
      showNotification('Copy failed', 'error');
    }
  };

  const submitCallback = async (provider: OAuthProvider) => {
    const redirectUrl = (states[provider]?.callbackUrl || '').trim();
    if (!redirectUrl) {
      showNotification(t('auth_login.oauth_callback_required'), 'warning');
      return;
    }
    updateProviderState(provider, {
      callbackSubmitting: true,
      callbackStatus: undefined,
      callbackError: undefined
    });
    try {
      await oauthApi.submitCallback(provider, redirectUrl);
      updateProviderState(provider, { callbackSubmitting: false, callbackStatus: 'success' });
      showNotification(t('auth_login.oauth_callback_success'), 'success');
    } catch (err: any) {
      const errorMessage =
        err?.status === 404
          ? t('auth_login.oauth_callback_upgrade_hint', {
              defaultValue: 'Please update CLI Proxy API or check the connection.'
            })
          : err?.message;
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: 'error',
        callbackError: errorMessage
      });
      const notificationMessage = errorMessage
        ? `${t('auth_login.oauth_callback_error')} ${errorMessage}`
        : t('auth_login.oauth_callback_error');
      showNotification(notificationMessage, 'error');
    }
  };

  const submitIflowCookie = async () => {
    const cookie = iflowCookie.cookie.trim();
    if (!cookie) {
      showNotification(t('auth_login.iflow_cookie_required'), 'warning');
      return;
    }
    setIflowCookie((prev) => ({
      ...prev,
      loading: true,
      error: undefined,
      errorType: undefined,
      result: undefined
    }));
    try {
      const res = await oauthApi.iflowCookieAuth(cookie);
      if (res.status === 'ok') {
        setIflowCookie((prev) => ({ ...prev, loading: false, result: res }));
        showNotification(t('auth_login.iflow_cookie_status_success'), 'success');
      } else {
        setIflowCookie((prev) => ({
          ...prev,
          loading: false,
          error: res.error,
          errorType: 'error'
        }));
        showNotification(`${t('auth_login.iflow_cookie_status_error')} ${res.error || ''}`, 'error');
      }
    } catch (err: any) {
      if (err?.status === 409) {
        const message = t('auth_login.iflow_cookie_config_duplicate');
        setIflowCookie((prev) => ({ ...prev, loading: false, error: message, errorType: 'warning' }));
        showNotification(message, 'warning');
        return;
      }
      setIflowCookie((prev) => ({ ...prev, loading: false, error: err?.message, errorType: 'error' }));
      showNotification(`${t('auth_login.iflow_cookie_start_error')} ${err?.message || ''}`, 'error');
    }
  };

  const startKiroPolling = (stateParam: string) => {
    const timerKey = 'kiro';
    if (timers.current[timerKey]) {
      clearInterval(timers.current[timerKey]);
    }
    let authUrlOpened = false;
    const timer = window.setInterval(async () => {
      try {
        const res = await kiroApi.getAuthStatus(stateParam);
        if (res.status === 'ok') {
          setKiroState((prev) => ({ ...prev, status: 'success', polling: false }));
          showNotification(t('kiro.oauth.success'), 'success');
          window.clearInterval(timer);
          delete timers.current[timerKey];
        } else if (res.status === 'device_code') {
          setKiroState((prev) => ({
            ...prev,
            status: 'device_code',
            verificationUrl: res.verification_url,
            userCode: res.user_code
          }));
        } else if (res.status === 'auth_url' && res.url) {
          if (!authUrlOpened) {
            authUrlOpened = true;
            setKiroState((prev) => ({
              ...prev,
              status: 'auth_url',
              authUrl: res.url
            }));
            window.open(res.url, '_blank');
          }
        } else if (res.status === 'error') {
          const errorStr = res.error || '';
          const AUTH_URL_PREFIX = 'auth_url|';
          if (errorStr.startsWith(AUTH_URL_PREFIX)) {
            if (!authUrlOpened) {
              const authUrl = errorStr.substring(AUTH_URL_PREFIX.length);
              authUrlOpened = true;
              setKiroState((prev) => ({
                ...prev,
                status: 'auth_url',
                authUrl: authUrl
              }));
              window.open(authUrl, '_blank');
            }
          } else {
            setKiroState((prev) => ({
              ...prev,
              status: 'error',
              error: res.error,
              polling: false
            }));
            showNotification(`${t('kiro.oauth.error')} ${res.error || ''}`, 'error');
            window.clearInterval(timer);
            delete timers.current[timerKey];
          }
        }
      } catch (err: any) {
        setKiroState((prev) => ({
          ...prev,
          status: 'error',
          error: err?.message,
          polling: false
        }));
        window.clearInterval(timer);
        delete timers.current[timerKey];
      }
    }, 3000);
    timers.current[timerKey] = timer;
  };

  const startKiroAuth = async (provider: KiroAuthProvider) => {
    setKiroState({
      status: 'waiting',
      polling: true,
      error: undefined,
      activeProvider: provider
    });
    try {
      let res;
      switch (provider) {
        case 'google':
          res = await kiroApi.startGoogleAuth();
          break;
        case 'github':
          res = await kiroApi.startGithubAuth();
          break;
        case 'aws':
          res = await kiroApi.startAwsAuth();
          break;
      }
      if (!res) {
        throw new Error('No response from server');
      }
      setKiroState((prev) => ({
        ...prev,
        url: res.url,
        state: res.state,
        status: 'waiting',
        polling: true
      }));
      if (res.state) {
        startKiroPolling(res.state);
      }
    } catch (err: any) {
      setKiroState((prev) => ({
        ...prev,
        status: 'error',
        error: err?.message,
        polling: false
      }));
      showNotification(`${t('kiro.oauth.startError')} ${err?.message || ''}`, 'error');
    }
  };

  const handleVertexFilePick = () => {
    vertexFileInputRef.current?.click();
  };

  const handleVertexFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showNotification(t('vertex_import.file_required'), 'warning');
      event.target.value = '';
      return;
    }
    setVertexState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      error: undefined,
      result: undefined
    }));
    event.target.value = '';
  };

  const handleVertexImport = async () => {
    if (!vertexState.file) {
      const message = t('vertex_import.file_required');
      setVertexState((prev) => ({ ...prev, error: message }));
      showNotification(message, 'warning');
      return;
    }
    const location = vertexState.location.trim();
    setVertexState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const res: VertexImportResponse = await vertexApi.importCredential(
        vertexState.file,
        location || undefined
      );
      const result: VertexImportResult = {
        projectId: res.project_id,
        email: res.email,
        location: res.location,
        authFile: res['auth-file'] ?? res.auth_file
      };
      setVertexState((prev) => ({ ...prev, loading: false, result }));
      showNotification(t('vertex_import.success'), 'success');
    } catch (err: any) {
      const message = err?.message || '';
      setVertexState((prev) => ({
        ...prev,
        loading: false,
        error: message || t('notification.upload_failed')
      }));
      const notification = message
        ? `${t('notification.upload_failed')}: ${message}`
        : t('notification.upload_failed');
      showNotification(notification, 'error');
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('nav.oauth', { defaultValue: 'OAuth' })}</h1>

      <div className={styles.content}>
        {PROVIDERS.map((provider) => {
          const state = states[provider.id] || {};
          const canSubmitCallback = CALLBACK_SUPPORTED.includes(provider.id) && Boolean(state.url);
          return (
            <div key={provider.id}>
              <Card
                title={
                  <span className={styles.cardTitle}>
                    <img
                      src={getIcon(provider.icon, resolvedTheme)}
                      alt=""
                      className={styles.cardTitleIcon}
                    />
                    {t(provider.titleKey)}
                  </span>
                }
                extra={
                  <Button onClick={() => startAuth(provider.id)} loading={state.polling}>
                    {t('common.login')}
                  </Button>
                }
              >
                <div className="hint">{t(provider.hintKey)}</div>
                {provider.id === 'gemini-cli' && (
                  <div className={styles.geminiProjectField}>
                    <Input
                      label={t('auth_login.gemini_cli_project_id_label')}
                      hint={t('auth_login.gemini_cli_project_id_hint')}
                      value={state.projectId || ''}
                      error={state.projectIdError}
                      onChange={(e) =>
                        updateProviderState(provider.id, {
                          projectId: e.target.value,
                          projectIdError: undefined
                        })
                      }
                      placeholder={t('auth_login.gemini_cli_project_id_placeholder')}
                    />
                  </div>
                )}
                {state.url && (
                  <div className={`connection-box ${styles.authUrlBox}`}>
                    <div className={styles.authUrlLabel}>{t(provider.urlLabelKey)}</div>
                    <div className={styles.authUrlValue}>{state.url}</div>
                    <div className={styles.authUrlActions}>
                      <Button variant="secondary" size="sm" onClick={() => copyLink(state.url!)}>
                        {t(getAuthKey(provider.id, 'copy_link'))}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(state.url, '_blank', 'noopener,noreferrer')}
                      >
                        {t(getAuthKey(provider.id, 'open_link'))}
                      </Button>
                    </div>
                  </div>
                )}
                {canSubmitCallback && (
                  <div className={styles.callbackSection}>
                    <Input
                      label={t('auth_login.oauth_callback_label')}
                      hint={t('auth_login.oauth_callback_hint')}
                      value={state.callbackUrl || ''}
                      onChange={(e) =>
                        updateProviderState(provider.id, {
                          callbackUrl: e.target.value,
                          callbackStatus: undefined,
                          callbackError: undefined
                        })
                      }
                      placeholder={t('auth_login.oauth_callback_placeholder')}
                    />
                    <div className={styles.callbackActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => submitCallback(provider.id)}
                        loading={state.callbackSubmitting}
                      >
                        {t('auth_login.oauth_callback_button')}
                      </Button>
                    </div>
                    {state.callbackStatus === 'success' && state.status === 'waiting' && (
                      <div className="status-badge success" style={{ marginTop: 8 }}>
                        {t('auth_login.oauth_callback_status_success')}
                      </div>
                    )}
                    {state.callbackStatus === 'error' && (
                      <div className="status-badge error" style={{ marginTop: 8 }}>
                        {t('auth_login.oauth_callback_status_error')} {state.callbackError || ''}
                      </div>
                    )}
                  </div>
                )}
                {state.status && state.status !== 'idle' && (
                  <div className="status-badge" style={{ marginTop: 8 }}>
                    {state.status === 'success'
                      ? t(getAuthKey(provider.id, 'oauth_status_success'))
                      : state.status === 'error'
                        ? `${t(getAuthKey(provider.id, 'oauth_status_error'))} ${state.error || ''}`
                        : t(getAuthKey(provider.id, 'oauth_status_waiting'))}
                  </div>
                )}
              </Card>
            </div>
          );
        })}

        {/* Vertex JSON 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconVertex} alt="" className={styles.cardTitleIcon} />
              {t('vertex_import.title')}
            </span>
          }
          extra={
            <Button onClick={handleVertexImport} loading={vertexState.loading}>
              {t('vertex_import.import_button')}
            </Button>
          }
        >
          <div className="hint">{t('vertex_import.description')}</div>
          <Input
            label={t('vertex_import.location_label')}
            hint={t('vertex_import.location_hint')}
            value={vertexState.location}
            onChange={(e) =>
              setVertexState((prev) => ({
                ...prev,
                location: e.target.value
              }))
            }
            placeholder={t('vertex_import.location_placeholder')}
          />
          <div className="form-group">
            <label>{t('vertex_import.file_label')}</label>
            <div className={styles.filePicker}>
              <Button variant="secondary" size="sm" onClick={handleVertexFilePick}>
                {t('vertex_import.choose_file')}
              </Button>
              <div
                className={`${styles.fileName} ${
                  vertexState.fileName ? '' : styles.fileNamePlaceholder
                }`.trim()}
              >
                {vertexState.fileName || t('vertex_import.file_placeholder')}
              </div>
            </div>
            <div className="hint">{t('vertex_import.file_hint')}</div>
            <input
              ref={vertexFileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleVertexFileChange}
            />
          </div>
          {vertexState.error && (
            <div className="status-badge error" style={{ marginTop: 8 }}>
              {vertexState.error}
            </div>
          )}
          {vertexState.result && (
            <div className="connection-box" style={{ marginTop: 12 }}>
              <div className="label">{t('vertex_import.result_title')}</div>
              <div className="key-value-list">
                {vertexState.result.projectId && (
                  <div className="key-value-item">
                    <span className="key">{t('vertex_import.result_project')}</span>
                    <span className="value">{vertexState.result.projectId}</span>
                  </div>
                )}
                {vertexState.result.email && (
                  <div className="key-value-item">
                    <span className="key">{t('vertex_import.result_email')}</span>
                    <span className="value">{vertexState.result.email}</span>
                  </div>
                )}
                {vertexState.result.location && (
                  <div className="key-value-item">
                    <span className="key">{t('vertex_import.result_location')}</span>
                    <span className="value">{vertexState.result.location}</span>
                  </div>
                )}
                {vertexState.result.authFile && (
                  <div className="key-value-item">
                    <span className="key">{t('vertex_import.result_file')}</span>
                    <span className="value">{vertexState.result.authFile}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* iFlow Cookie 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconIflow} alt="" className={styles.cardTitleIcon} />
              {t('auth_login.iflow_cookie_title')}
            </span>
          }
          extra={
            <Button onClick={submitIflowCookie} loading={iflowCookie.loading}>
              {t('auth_login.iflow_cookie_button')}
            </Button>
          }
        >
          <div className="hint">{t('auth_login.iflow_cookie_hint')}</div>
          <div className="hint" style={{ marginTop: 4 }}>
            {t('auth_login.iflow_cookie_key_hint')}
          </div>
          <div className="form-item" style={{ marginTop: 12 }}>
            <label className="label">{t('auth_login.iflow_cookie_label')}</label>
            <Input
              value={iflowCookie.cookie}
              onChange={(e) => setIflowCookie((prev) => ({ ...prev, cookie: e.target.value }))}
              placeholder={t('auth_login.iflow_cookie_placeholder')}
            />
          </div>
          {iflowCookie.error && (
            <div
              className={`status-badge ${iflowCookie.errorType === 'warning' ? 'warning' : 'error'}`}
              style={{ marginTop: 8 }}
            >
              {iflowCookie.errorType === 'warning'
                ? t('auth_login.iflow_cookie_status_duplicate')
                : t('auth_login.iflow_cookie_status_error')}{' '}
              {iflowCookie.error}
            </div>
          )}
          {iflowCookie.result && iflowCookie.result.status === 'ok' && (
            <div className="connection-box" style={{ marginTop: 12 }}>
              <div className="label">{t('auth_login.iflow_cookie_result_title')}</div>
              <div className="key-value-list">
                {iflowCookie.result.email && (
                  <div className="key-value-item">
                    <span className="key">{t('auth_login.iflow_cookie_result_email')}</span>
                    <span className="value">{iflowCookie.result.email}</span>
                  </div>
                )}
                {iflowCookie.result.expired && (
                  <div className="key-value-item">
                    <span className="key">{t('auth_login.iflow_cookie_result_expired')}</span>
                    <span className="value">{iflowCookie.result.expired}</span>
                  </div>
                )}
                {iflowCookie.result.saved_path && (
                  <div className="key-value-item">
                    <span className="key">{t('auth_login.iflow_cookie_result_path')}</span>
                    <span className="value">{iflowCookie.result.saved_path}</span>
                  </div>
                )}
                {iflowCookie.result.type && (
                  <div className="key-value-item">
                    <span className="key">{t('auth_login.iflow_cookie_result_type')}</span>
                    <span className="value">{iflowCookie.result.type}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconKiro} alt="" className={styles.cardTitleIcon} />
              {t('kiro.oauth.title')}
            </span>
          }
        >
          <div className="hint">{t('kiro.oauth.hint')}</div>
          <div className={styles.kiroAuthButtons}>
            <button
              type="button"
              className={`${styles.kiroAuthButton} ${styles['kiroAuthButton--google']}`}
              onClick={() => startKiroAuth('google')}
              disabled={kiroState.polling}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t('kiro.oauth.googleButton')}
            </button>
            <button
              type="button"
              className={`${styles.kiroAuthButton} ${styles['kiroAuthButton--github']}`}
              onClick={() => startKiroAuth('github')}
              disabled={kiroState.polling}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              {t('kiro.oauth.githubButton')}
            </button>
            <button
              type="button"
              className={`${styles.kiroAuthButton} ${styles['kiroAuthButton--aws']}`}
              onClick={() => startKiroAuth('aws')}
              disabled={kiroState.polling}
            >
              <svg viewBox="0 0 24 24" fill="#FF9900">
                <path d="M6.763 10.036c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 0 1-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 0 1-.287-.375 6.18 6.18 0 0 1-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.391-.384-.59-.894-.59-1.533 0-.678.239-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.296.072-.583.16-.863.272a2.287 2.287 0 0 1-.28.104.488.488 0 0 1-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 0 1 .224-.167c.28-.144.614-.264 1.005-.36a4.84 4.84 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647.439.43.662 1.085.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144.287-.096.543-.271.758-.51.128-.152.224-.32.272-.512.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 0 0-.735-.136 6.02 6.02 0 0 0-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 5.55a1.398 1.398 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 0 1 .32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 0 1-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32l-1.238-5.148-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.319.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758.777.777 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 0 1-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .359.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 0 1 .24.2.43.43 0 0 1 .071.263v.375c0 .168-.064.256-.184.256a.83.83 0 0 1-.303-.096 3.652 3.652 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926-.144.272-.336.511-.583.703-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167zM21.698 16.207c-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.27-.351 3.384 1.963 7.559 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.439-.2.814.287.385.607zM22.792 14.961c-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151.32-.79 1.03-2.57.695-2.994z"/>
              </svg>
              {t('kiro.oauth.awsButton')}
            </button>
          </div>
          {kiroState.verificationUrl && (
            <div className={`connection-box ${styles.authUrlBox}`}>
              <div className={styles.authUrlLabel}>验证链接 (Verification URL)</div>
              <div className={styles.authUrlValue}>{kiroState.verificationUrl}</div>
              {kiroState.userCode && (
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>
                  用户代码: {kiroState.userCode}
                </div>
              )}
              <div className={styles.authUrlActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(kiroState.verificationUrl!);
                    showNotification(t('notification.link_copied'), 'success');
                  }}
                >
                  {t('kiro.actions.copy')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(kiroState.verificationUrl, '_blank', 'noopener,noreferrer')}
                >
                  {t('auth_login.codex_open_link')}
                </Button>
              </div>
            </div>
          )}
          {kiroState.authUrl && (
            <div className={`connection-box ${styles.authUrlBox}`}>
              <div className={styles.authUrlLabel}>{t('kiro.oauth.authUrlLabel')}</div>
              <div className={styles.authUrlValue}>{kiroState.authUrl}</div>
              <div className={styles.authUrlActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(kiroState.authUrl!);
                    showNotification(t('notification.link_copied'), 'success');
                  }}
                >
                  {t('kiro.actions.copy')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(kiroState.authUrl, '_blank', 'noopener,noreferrer')}
                >
                  {t('auth_login.codex_open_link')}
                </Button>
              </div>
            </div>
          )}
          {kiroState.url && !kiroState.verificationUrl && !kiroState.authUrl && (
            <div className={`connection-box ${styles.authUrlBox}`}>
              <div className={styles.authUrlLabel}>{t('kiro.oauth.hint')}</div>
              <div className={styles.authUrlValue}>{kiroState.url}</div>
              <div className={styles.authUrlActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(kiroState.url!);
                    showNotification(t('notification.link_copied'), 'success');
                  }}
                >
                  {t('kiro.actions.copy')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(kiroState.url, '_blank', 'noopener,noreferrer')}
                >
                  {t('auth_login.codex_open_link')}
                </Button>
              </div>
            </div>
          )}
          {kiroState.status && kiroState.status !== 'idle' && (
            <div
              className={`status-badge ${kiroState.status === 'success' ? 'success' : kiroState.status === 'error' ? 'error' : ''}`}
              style={{ marginTop: 8 }}
            >
              {kiroState.status === 'success'
                ? t('kiro.oauth.success')
                : kiroState.status === 'error'
                  ? `${t('kiro.oauth.error')} ${kiroState.error || ''}`
                  : kiroState.status === 'device_code'
                    ? t('kiro.oauth.waiting')
                    : t('kiro.oauth.waiting')}
            </div>
          )}
          {kiroState.polling && (
            <div style={{ marginTop: 12 }}>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    const res = await kiroApi.importKiroIDEToken();
                    if (res.status === 'ok') {
                      setKiroState((prev) => ({
                        ...prev,
                        status: 'success',
                        polling: false
                      }));
                      showNotification(t('kiro.oauth.success'), 'success');
                      Object.values(timers.current).forEach((t) => window.clearInterval(t));
                      timers.current = {};
                    } else {
                      showNotification(res.error || t('kiro.oauth.error'), 'error');
                    }
                  } catch (err: any) {
                    showNotification(err?.message || t('kiro.oauth.error'), 'error');
                  }
                }}
              >
                {t('kiro.oauth.manualImport', { defaultValue: '已在 Kiro 完成登录？点击导入' })}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
