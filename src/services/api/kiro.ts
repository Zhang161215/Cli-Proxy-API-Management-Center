/**
 * Kiro (AWS CodeWhisperer) 账号管理 API
 */

import { apiClient } from './client';
import type {
  KiroAccountItem,
  KiroOAuthStartResponse,
  KiroOAuthStatusResponse,
  KiroRefreshResponse,
  KiroImportResponse,
  KiroUsageData,
  KiroImportAccountData,
  KiroBatchImportResponse
} from '@/types';
import type { AuthFilesResponse } from '@/types/authFile';

// Kiro 认证文件前缀
const KIRO_FILE_PREFIXES = ['kiro-', 'amazonq-'];

function extractIdFromFileName(fileName: string): string {
  const baseName = fileName.replace('.json', '');
  const parts = baseName.split('-');
  if (parts.length >= 3) {
    return parts.slice(2).join('-');
  }
  return baseName;
}

function parseKiroAuthFile(fileName: string, content: Record<string, any>): KiroAccountItem | null {
  try {
    // 从文件名提取 provider
    let provider = 'Unknown';
    let authMethod: string = 'social';

    if (fileName.startsWith('kiro-aws-') || fileName.startsWith('amazonq-')) {
      provider = 'BuilderId';
      authMethod = 'builder-id';
    } else if (fileName.startsWith('kiro-google-')) {
      provider = 'Google';
      authMethod = 'social';
    } else if (fileName.startsWith('kiro-github-')) {
      provider = 'Github';
      authMethod = 'social';
    } else if (fileName.includes('idc') || content.startUrl) {
      provider = 'Enterprise';
      authMethod = 'idc';
    }

    // 检测账号状态
    let status: string = 'unknown';
    const accessToken = content.accessToken || content.access_token;
    const expiresAtStr = content.expiresAt || content.expires_at;
    if (accessToken) {
      if (expiresAtStr) {
        const expiresAt = new Date(expiresAtStr);
        status = expiresAt > new Date() ? 'active' : 'expired';
      } else {
        status = 'active';
      }
    }

    // 解析 usage 数据
    let usageData: KiroUsageData | undefined;
    if (content.usageData || content.usage) {
      const rawUsage = content.usageData || content.usage;
      usageData = {
        usageBreakdown: rawUsage.usageBreakdown,
        usageBreakdownList: rawUsage.usageBreakdownList,
        subscriptionInfo: rawUsage.subscriptionInfo,
        userInfo: rawUsage.userInfo,
        overageConfiguration: rawUsage.overageConfiguration,
        daysUntilReset: rawUsage.daysUntilReset,
        nextDateReset: rawUsage.nextDateReset
      };
    }

    return {
      id: fileName.replace('.json', ''),
      email: content.email || content.metadata?.email || extractIdFromFileName(fileName),
      label: content.label || content.metadata?.label,
      provider,
      authMethod,
      status,
      accessToken: content.accessToken || content.access_token,
      refreshToken: content.refreshToken || content.refresh_token,
      profileArn: content.profileArn || content.metadata?.profileArn,
      expiresAt: content.expiresAt || content.expires_at,
      clientId: content.clientId || content.client_id,
      clientSecret: content.clientSecret || content.client_secret,
      clientIdHash: content.clientIdHash,
      region: content.region || content.metadata?.region,
      startUrl: content.startUrl || content.metadata?.startUrl,
      usageData,
      createdAt: content.createdAt || content.metadata?.createdAt,
      updatedAt: content.updatedAt || content.metadata?.updatedAt,
      lastRefreshedAt: content.lastRefreshedAt || content.last_refresh,
      fileName,
      filePath: content.filePath
    };
  } catch (e) {
    console.error(`Failed to parse Kiro auth file ${fileName}:`, e);
    return null;
  }
}

/**
 * 检查文件名是否为 Kiro 认证文件
 */
function isKiroAuthFile(fileName: string): boolean {
  return KIRO_FILE_PREFIXES.some((prefix) => fileName.toLowerCase().startsWith(prefix));
}

export const kiroApi = {
  /**
   * 获取所有 Kiro 账号列表
   * 从 /auth-files 接口获取认证文件列表，不逐个请求详情
   */
  async getAccounts(): Promise<KiroAccountItem[]> {
    const response = await apiClient.get<AuthFilesResponse>('/auth-files');
    const files = response?.files || [];

    const accounts: KiroAccountItem[] = [];

    for (const file of files) {
      if (!isKiroAuthFile(file.name)) continue;

      let provider = 'Unknown';
      let authMethod: string = 'social';
      const lowerName = file.name.toLowerCase();

      if (lowerName.startsWith('kiro-builderid-') || lowerName.startsWith('amazonq-')) {
        provider = 'BuilderId';
        authMethod = 'builder-id';
      } else if (lowerName.startsWith('kiro-google-')) {
        provider = 'Google';
        authMethod = 'social';
      } else if (lowerName.startsWith('kiro-github-')) {
        provider = 'Github';
        authMethod = 'social';
      } else if (lowerName.includes('idc')) {
        provider = 'Enterprise';
        authMethod = 'idc';
      }

      accounts.push({
        id: file.name.replace('.json', ''),
        email: file.email || extractIdFromFileName(file.name),
        label: file.label,
        provider,
        authMethod,
        status: file.status || 'unknown',
        fileName: file.name,
      });
    }

    return accounts;
  },

  /**
   * 获取单个 Kiro 账号详情
   */
  async getAccount(id: string): Promise<KiroAccountItem | null> {
    const fileName = id.endsWith('.json') ? id : `${id}.json`;
    try {
      const content = await apiClient.get(`/auth-files?name=${encodeURIComponent(fileName)}`);
      return parseKiroAuthFile(fileName, content || {});
    } catch {
      return null;
    }
  },

  /**
   * 删除 Kiro 账号
   */
  deleteAccount: (id: string) => {
    const fileName = id.endsWith('.json') ? id : `${id}.json`;
    return apiClient.delete(`/auth-files?name=${encodeURIComponent(fileName)}`);
  },

  /**
   * 批量删除 Kiro 账号
   */
  async deleteAccounts(ids: string[]): Promise<{ success: boolean; deleted: string[]; errors: string[] }> {
    const deleted: string[] = [];
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await kiroApi.deleteAccount(id);
        deleted.push(id);
      } catch (e) {
        errors.push(id);
      }
    }

    return { success: errors.length === 0, deleted, errors };
  },

  /**
   * 更新 Kiro 账号标签
   */
  async updateAccountLabel(id: string, label: string): Promise<{ success: boolean }> {
    const fileName = id.endsWith('.json') ? id : `${id}.json`;
    try {
      // 获取现有内容
      const content = await apiClient.get(`/auth-files?name=${encodeURIComponent(fileName)}`);
      if (!content) {
        throw new Error('Account not found');
      }
      // 更新标签
      content.label = label;
      content.metadata = { ...(content.metadata || {}), label };
      // 保存回去
      await apiClient.put(`/auth-files?name=${encodeURIComponent(fileName)}`, content);
      return { success: true };
    } catch {
      return { success: false };
    }
  },

  /**
   * 开始 Kiro OAuth 认证 (通过 Google)
   */
startGoogleAuth: () =>
    apiClient.get<KiroOAuthStartResponse>('/kiro-auth-url', {
      params: { method: 'google', is_webui: true }
    }),

  startGithubAuth: () =>
    apiClient.get<KiroOAuthStartResponse>('/kiro-auth-url', {
      params: { method: 'github', is_webui: true }
    }),

  startAwsAuth: () =>
    apiClient.get<KiroOAuthStartResponse>('/kiro-auth-url', {
      params: { method: 'aws', is_webui: true }
    }),

  /**
   * 获取 OAuth 认证状态
   */
  getAuthStatus: (state: string) =>
    apiClient.get<KiroOAuthStatusResponse>('/get-auth-status', {
      params: { state }
    }),

  /**
   * 手动导入 Kiro IDE token 文件
   */
  importKiroIDEToken: () =>
    apiClient.post<{ status: string; provider?: string; email?: string; saved_path?: string; error?: string }>('/import-kiro-token'),

  getKiroUsage: (fileName: string) =>
    apiClient.get<{ status: string; subscription_title?: string; current_usage?: number; usage_limit?: number; next_reset?: string; error?: string }>('/kiro-usage', {
      params: { name: fileName }
    }),

  importKiroAccounts: (accounts: KiroImportAccountData[]) =>
    apiClient.post<KiroBatchImportResponse>('/import-kiro-accounts', { accounts }),

  /**
   * 刷新 Kiro 账号 token
   */
  async refreshAccount(id: string): Promise<KiroRefreshResponse> {
    const fileName = id.endsWith('.json') ? id : `${id}.json`;
    try {
      // 目前后端没有专门的刷新接口，我们通过重新读取文件来获取最新状态
      // 实际的 token 刷新是在请求时由 executor 自动处理的
      const content = await apiClient.get(`/auth-files?name=${encodeURIComponent(fileName)}`);
      const account = parseKiroAuthFile(fileName, content || {});
      return { success: true, account: account || undefined };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  /**
   * 批量刷新所有 Kiro 账号
   */
  async refreshAllAccounts(): Promise<{ success: number; failed: number; accounts: KiroAccountItem[] }> {
    const accounts = await kiroApi.getAccounts();
    let success = 0;
    let failed = 0;
    const refreshedAccounts: KiroAccountItem[] = [];

    for (const account of accounts) {
      const result = await kiroApi.refreshAccount(account.id);
      if (result.success && result.account) {
        success++;
        refreshedAccounts.push(result.account);
      } else {
        failed++;
        refreshedAccounts.push(account);
      }
    }

    return { success, failed, accounts: refreshedAccounts };
  },

  /**
   * 导入 Kiro 认证文件
   */
  async importAuthFile(file: File): Promise<KiroImportResponse> {
    try {
      // 验证文件名
      if (!isKiroAuthFile(file.name)) {
        return { success: false, error: 'Invalid Kiro auth file name' };
      }

      const formData = new FormData();
      formData.append('file', file, file.name);
      const response = await apiClient.postForm('/auth-files', formData);
      return { success: true, savedPath: response?.savedPath, email: response?.email };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  /**
   * 导入 JSON 格式的账号数据
   */
  async importAccountData(data: {
    email: string;
    accessToken: string;
    refreshToken: string;
    provider?: string;
    profileArn?: string;
    clientId?: string;
    clientSecret?: string;
    region?: string;
    startUrl?: string;
  }): Promise<KiroImportResponse> {
    try {
      const provider = data.provider?.toLowerCase() || 'google';
      const emailPart = data.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '-');
      const fileName = `kiro-${provider}-${emailPart}.json`;

      const content = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        email: data.email,
        profileArn: data.profileArn,
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        region: data.region,
        startUrl: data.startUrl,
        createdAt: new Date().toISOString(),
        metadata: {
          type: 'kiro',
          provider,
          email: data.email
        }
      };

      await apiClient.put(`/auth-files?name=${encodeURIComponent(fileName)}`, content);
      return { success: true, savedPath: fileName, email: data.email, provider };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  /**
   * 导出账号数据 (用于备份)
   */
  async exportAccounts(ids?: string[]): Promise<string> {
    const accounts = await kiroApi.getAccounts();
    const toExport = ids?.length
      ? accounts.filter((a) => ids.includes(a.id))
      : accounts;

    // 移除敏感信息
    const exportData = toExport.map((account) => ({
      id: account.id,
      email: account.email,
      label: account.label,
      provider: account.provider,
      authMethod: account.authMethod,
      status: account.status,
      expiresAt: account.expiresAt,
      region: account.region,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    }));

    return JSON.stringify(exportData, null, 2);
  },

  /**
   * 获取 Kiro 账号的使用量数据
   * 注意: 使用量数据是在 token 刷新时由后端更新的
   */
  async getAccountUsage(id: string): Promise<KiroUsageData | null> {
    const account = await kiroApi.getAccount(id);
    return account?.usageData || null;
  }
};
