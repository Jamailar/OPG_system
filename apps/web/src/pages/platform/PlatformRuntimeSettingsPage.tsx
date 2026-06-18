import { useEffect, useMemo, useState } from 'react';
import {
  PlatformIntegrationApiKeyItem,
  PlatformRuntimeSettings,
  platformApi,
} from '@/lib/api';
import { pickApiErrorMessage } from '@/lib/api-response';

type Message = { type: 'success' | 'error'; text: string } | null;

type RuntimeSettingsForm = {
  api_base_url: string;
  admin_frontend_url: string;
  cors_origins_text: string;
  session_policy_text: string;
  payments_scheduler_text: string;
  ai_gateway_tuning_text: string;
  oauth_settings_text: string;
  integration_settings_text: string;
};

const EMPTY_FORM: RuntimeSettingsForm = {
  api_base_url: '',
  admin_frontend_url: '',
  cors_origins_text: '',
  session_policy_text: '{}',
  payments_scheduler_text: '{}',
  ai_gateway_tuning_text: '{}',
  oauth_settings_text: '{}',
  integration_settings_text: '{}',
};

function formatJson(value: unknown) {
  return JSON.stringify(value && typeof value === 'object' ? value : {}, null, 2);
}

function toForm(settings: PlatformRuntimeSettings): RuntimeSettingsForm {
  return {
    api_base_url: settings.api_base_url || '',
    admin_frontend_url: settings.admin_frontend_url || '',
    cors_origins_text: (settings.cors_origins || []).join('\n'),
    session_policy_text: formatJson(settings.session_policy),
    payments_scheduler_text: formatJson(settings.payments_scheduler),
    ai_gateway_tuning_text: formatJson(settings.ai_gateway_tuning),
    oauth_settings_text: formatJson(settings.oauth_settings),
    integration_settings_text: formatJson(settings.integration_settings),
  };
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const text = value.trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
}) {
  return (
    <div className={textarea ? 'form-group platform-form-span-2' : 'form-group'}>
      <label>{label}</label>
      {textarea ? (
        <textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

export default function PlatformRuntimeSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [settings, setSettings] = useState<PlatformRuntimeSettings | null>(null);
  const [form, setForm] = useState<RuntimeSettingsForm>(EMPTY_FORM);
  const [apiKeys, setApiKeys] = useState<PlatformIntegrationApiKeyItem[]>([]);
  const [apiKeyName, setApiKeyName] = useState('Feedback Admin API');
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [createdToken, setCreatedToken] = useState('');

  const sources = useMemo(() => Object.entries(settings?.config_sources || {}), [settings]);

  const loadSettings = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const next = await platformApi.getRuntimeSettings();
      const keys = await platformApi.listIntegrationApiKeys();
      setSettings(next);
      setForm(toForm(next));
      setApiKeys(keys.items || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '加载平台设置失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const updateForm = (patch: Partial<RuntimeSettingsForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        api_base_url: form.api_base_url.trim() || null,
        admin_frontend_url: form.admin_frontend_url.trim() || null,
        cors_origins: form.cors_origins_text
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        session_policy: parseJsonObject(form.session_policy_text, 'Session Policy'),
        payments_scheduler: parseJsonObject(form.payments_scheduler_text, 'Payments Scheduler'),
        ai_gateway_tuning: parseJsonObject(form.ai_gateway_tuning_text, 'AI Gateway Tuning'),
        oauth_settings: parseJsonObject(form.oauth_settings_text, 'OAuth Settings'),
        integration_settings: parseJsonObject(form.integration_settings_text, 'Integration Settings'),
      };
      const next = await platformApi.updateRuntimeSettings(payload);
      setSettings(next);
      setForm(toForm(next));
      setMessage({ type: 'success', text: '已保存' });
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, error?.message || '保存平台设置失败') });
    } finally {
      setSaving(false);
    }
  };

  const createApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiKeySaving(true);
    setCreatedToken('');
    setMessage(null);
    try {
      const created = await platformApi.createIntegrationApiKey({
        name: apiKeyName.trim() || 'Feedback Admin API',
        scopes: ['feedback:admin'],
      });
      setCreatedToken(created.token || '');
      const keys = await platformApi.listIntegrationApiKeys();
      setApiKeys(keys.items || []);
      setMessage({ type: 'success', text: '集成密钥已创建' });
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '创建集成密钥失败') });
    } finally {
      setApiKeySaving(false);
    }
  };

  const revokeApiKey = async (apiKeyId: string) => {
    setMessage(null);
    try {
      await platformApi.revokeIntegrationApiKey(apiKeyId);
      const keys = await platformApi.listIntegrationApiKeys();
      setApiKeys(keys.items || []);
      setMessage({ type: 'success', text: '集成密钥已撤销' });
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '撤销集成密钥失败') });
    }
  };

  return (
    <div className="platform-page">
      <div className="platform-page-head">
        <div>
          <h1>平台设置</h1>
          <p>运行时配置</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={loadSettings} disabled={loading || saving}>
          刷新
        </button>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="platform-stats-grid compact">
        {sources.map(([key, value]) => (
          <div className="platform-stat-card" key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <form className="platform-card" onSubmit={save}>
        <div className="platform-form-grid">
          <Field
            label="API Base URL"
            value={form.api_base_url}
            placeholder="https://api.example.com"
            onChange={(value) => updateForm({ api_base_url: value })}
          />
          <Field
            label="Admin Frontend URL"
            value={form.admin_frontend_url}
            placeholder="https://admin.example.com"
            onChange={(value) => updateForm({ admin_frontend_url: value })}
          />
          <Field
            label="CORS Origins"
            value={form.cors_origins_text}
            placeholder="https://admin.example.com"
            textarea
            rows={4}
            onChange={(value) => updateForm({ cors_origins_text: value })}
          />
          <Field
            label="Session Policy"
            value={form.session_policy_text}
            textarea
            rows={5}
            onChange={(value) => updateForm({ session_policy_text: value })}
          />
          <Field
            label="Payments Scheduler"
            value={form.payments_scheduler_text}
            textarea
            rows={5}
            onChange={(value) => updateForm({ payments_scheduler_text: value })}
          />
          <Field
            label="AI Gateway Tuning"
            value={form.ai_gateway_tuning_text}
            textarea
            rows={7}
            onChange={(value) => updateForm({ ai_gateway_tuning_text: value })}
          />
          <Field
            label="OAuth Settings"
            value={form.oauth_settings_text}
            textarea
            rows={5}
            onChange={(value) => updateForm({ oauth_settings_text: value })}
          />
          <Field
            label="Integration Settings"
            value={form.integration_settings_text}
            textarea
            rows={5}
            onChange={(value) => updateForm({ integration_settings_text: value })}
          />
        </div>

        <div className="platform-form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving || loading}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>

      <form className="platform-card" onSubmit={createApiKey}>
        <div className="platform-page-head">
          <div>
            <h1>集成密钥</h1>
            <p>Feedback Admin API</p>
          </div>
        </div>

        {createdToken && (
          <div className="alert alert-info">
            <code>{createdToken}</code>
          </div>
        )}

        <div className="platform-form-grid">
          <Field label="名称" value={apiKeyName} onChange={setApiKeyName} />
          <div className="form-group">
            <label>Scope</label>
            <input value="feedback:admin" disabled />
          </div>
        </div>

        <div className="platform-form-actions">
          <button className="btn btn-primary" type="submit" disabled={apiKeySaving}>
            {apiKeySaving ? '生成中...' : '生成密钥'}
          </button>
        </div>

        <div className="table-container" style={{ marginTop: 16 }}>
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>前缀</th>
                <th>状态</th>
                <th>最近使用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td><code>{item.key_prefix}</code></td>
                  <td>{item.status}</td>
                  <td>{item.last_used_at ? new Date(item.last_used_at).toLocaleString() : '-'}</td>
                  <td>
                    {item.status === 'ACTIVE' && (
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => void revokeApiKey(item.id)}>
                        撤销
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {apiKeys.length === 0 && (
                <tr>
                  <td colSpan={5}>暂无密钥</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>
    </div>
  );
}
