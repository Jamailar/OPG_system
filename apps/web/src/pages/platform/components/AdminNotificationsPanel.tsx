import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  PlatformNotificationChannelInput,
  PlatformNotificationChannelItem,
  PlatformNotificationChannelType,
  PlatformNotificationDeliveryItem,
  PlatformNotificationEventCatalogItem,
  PlatformNotificationEventItem,
  PlatformNotificationRuleItem,
  PlatformNotificationSeverity,
  platformApi,
} from '@/lib/api';
import { pickApiErrorMessage } from '@/lib/api-response';

type Message = { type: 'success' | 'error'; text: string } | null;

const SEVERITIES: Array<{ value: PlatformNotificationSeverity; label: string }> = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const EMPTY_CHANNEL_FORM = {
  channel_type: 'FEISHU_ROBOT' as PlatformNotificationChannelType,
  name: '',
  webhook_url: '',
  secret: '',
  recipients: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
};

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function statusClass(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (['sent', 'active', 'queued', 'recorded'].includes(normalized)) return 'success';
  if (['failed', 'deleted'].includes(normalized)) return 'error';
  if (['retry', 'pending', 'sending'].includes(normalized)) return 'warning';
  return 'muted';
}

function severityClass(severity?: string | null) {
  if (severity === 'critical') return 'error';
  if (severity === 'high') return 'warning';
  if (severity === 'warning') return 'info';
  return 'muted';
}

function splitRecipients(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeRules(
  catalog: PlatformNotificationEventCatalogItem[],
  savedRules: PlatformNotificationRuleItem[],
): PlatformNotificationRuleItem[] {
  const savedByEvent = new Map(savedRules.map((item) => [item.event_type, item]));
  return catalog.map((item) => ({
    id: savedByEvent.get(item.event_type)?.id,
    app_id: savedByEvent.get(item.event_type)?.app_id || null,
    event_type: item.event_type,
    min_severity: savedByEvent.get(item.event_type)?.min_severity || item.min_severity || 'info',
    channel_ids: savedByEvent.get(item.event_type)?.channel_ids || [],
    enabled: savedByEvent.get(item.event_type)?.enabled ?? true,
    dedupe_window_seconds: savedByEvent.get(item.event_type)?.dedupe_window_seconds ?? 600,
    aggregation_window_seconds: savedByEvent.get(item.event_type)?.aggregation_window_seconds ?? 0,
    quiet_hours: savedByEvent.get(item.event_type)?.quiet_hours || {},
  }));
}

export default function AdminNotificationsPanel({ appId, compact = false }: { appId?: string; compact?: boolean }) {
  const [catalog, setCatalog] = useState<PlatformNotificationEventCatalogItem[]>([]);
  const [channels, setChannels] = useState<PlatformNotificationChannelItem[]>([]);
  const [rules, setRules] = useState<PlatformNotificationRuleItem[]>([]);
  const [events, setEvents] = useState<PlatformNotificationEventItem[]>([]);
  const [deliveries, setDeliveries] = useState<PlatformNotificationDeliveryItem[]>([]);
  const [channelForm, setChannelForm] = useState(EMPTY_CHANNEL_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const activeChannels = useMemo(() => channels.filter((item) => item.status === 'ACTIVE'), [channels]);
  const inheritGlobal = Boolean(appId && activeChannels.length === 0);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [catalogResp, channelsResp, rulesResp, eventsResp, deliveriesResp] = await Promise.all([
        appId ? platformApi.listAppNotificationEventCatalog(appId) : platformApi.listNotificationEventCatalog(),
        appId ? platformApi.listAppNotificationChannels(appId) : platformApi.listNotificationChannels(),
        appId ? platformApi.listAppNotificationRules(appId) : platformApi.listNotificationRules(),
        appId ? platformApi.listAppNotificationEvents(appId, { limit: 30 }) : platformApi.listNotificationEvents({ limit: 30 }),
        appId ? platformApi.listAppNotificationDeliveries(appId, { limit: 30 }) : platformApi.listNotificationDeliveries({ limit: 30 }),
      ]);
      const nextCatalog = catalogResp.items?.length ? catalogResp.items : rulesResp.event_catalog || [];
      setCatalog(nextCatalog);
      setChannels(channelsResp.items || []);
      setRules(mergeRules(nextCatalog, rulesResp.items || []));
      setEvents(eventsResp.items || []);
      setDeliveries(deliveriesResp.items || []);
    } catch (error: unknown) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '加载通知配置失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [appId]);

  const createChannel = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: PlatformNotificationChannelInput = {
        channel_type: channelForm.channel_type,
        name: channelForm.name.trim(),
        status: channelForm.status,
      };
      if (channelForm.channel_type === 'FEISHU_ROBOT') {
        payload.webhook_url = channelForm.webhook_url.trim();
        payload.secret = channelForm.secret.trim();
      } else {
        payload.recipients = splitRecipients(channelForm.recipients);
      }
      if (appId) {
        await platformApi.createAppNotificationChannel(appId, payload);
      } else {
        await platformApi.createNotificationChannel(payload);
      }
      setChannelForm(EMPTY_CHANNEL_FORM);
      setMessage({ type: 'success', text: '渠道已保存' });
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '保存渠道失败') });
    } finally {
      setSaving(false);
    }
  };

  const updateChannelStatus = async (item: PlatformNotificationChannelItem, status: 'ACTIVE' | 'INACTIVE') => {
    setSaving(true);
    setMessage(null);
    try {
      if (appId) {
        await platformApi.updateAppNotificationChannel(appId, item.id, { status });
      } else {
        await platformApi.updateNotificationChannel(item.id, { status });
      }
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '更新渠道失败') });
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (item: PlatformNotificationChannelItem) => {
    setSaving(true);
    setMessage(null);
    try {
      if (appId) {
        await platformApi.testAppNotificationChannel(appId, item.id);
      } else {
        await platformApi.testNotificationChannel(item.id);
      }
      setMessage({ type: 'success', text: '测试已发送' });
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '测试发送失败') });
    } finally {
      setSaving(false);
    }
  };

  const deleteChannel = async (item: PlatformNotificationChannelItem) => {
    setSaving(true);
    setMessage(null);
    try {
      if (appId) {
        await platformApi.deleteAppNotificationChannel(appId, item.id);
      } else {
        await platformApi.deleteNotificationChannel(item.id);
      }
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '删除渠道失败') });
    } finally {
      setSaving(false);
    }
  };

  const updateRule = (eventType: string, patch: Partial<PlatformNotificationRuleItem>) => {
    setRules((current) => current.map((item) => (item.event_type === eventType ? { ...item, ...patch } : item)));
  };

  const saveRules = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = { items: rules };
      if (appId) {
        await platformApi.updateAppNotificationRules(appId, payload);
      } else {
        await platformApi.updateNotificationRules(payload);
      }
      setMessage({ type: 'success', text: '规则已保存' });
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '保存规则失败') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={compact ? 'tenant-notifications-panel' : 'platform-notifications-panel'}>
      {!compact && (
        <div className="platform-page-head">
          <div>
            <h1>通知</h1>
            <p>飞书、邮件、事件规则和投递记录。</p>
          </div>
          <button className="btn btn-secondary btn-sm" type="button" onClick={loadData} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
        </div>
      )}

      {compact && (
        <div className="platform-section-head">
          <div>
            <h3>通知</h3>
            <p>飞书、邮件、规则和投递。</p>
          </div>
          <div className="btn-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={inheritGlobal} readOnly />
              继承平台默认
            </label>
            <button className="btn btn-secondary btn-sm" type="button" onClick={loadData} disabled={loading}>
              刷新
            </button>
          </div>
        </div>
      )}

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <section className="card">
        <div className="platform-section-head">
          <div>
            <h3>{appId ? 'App 渠道' : '全局渠道'}</h3>
            <p>{activeChannels.length} 个启用</p>
          </div>
          {appId && <span className={`status-tag ${inheritGlobal ? 'info' : 'success'}`}>{inheritGlobal ? '继承' : '自定义'}</span>}
        </div>

        <form className="platform-form-grid compact" onSubmit={createChannel}>
          <select
            value={channelForm.channel_type}
            onChange={(event) => setChannelForm((current) => ({ ...current, channel_type: event.target.value as PlatformNotificationChannelType }))}
          >
            <option value="FEISHU_ROBOT">飞书机器人</option>
            <option value="EMAIL">邮件</option>
          </select>
          <input
            value={channelForm.name}
            onChange={(event) => setChannelForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="渠道名称"
          />
          {channelForm.channel_type === 'FEISHU_ROBOT' ? (
            <>
              <input
                className="span-2"
                value={channelForm.webhook_url}
                onChange={(event) => setChannelForm((current) => ({ ...current, webhook_url: event.target.value }))}
                placeholder="Webhook URL"
              />
              <input
                value={channelForm.secret}
                onChange={(event) => setChannelForm((current) => ({ ...current, secret: event.target.value }))}
                placeholder="Secret"
              />
            </>
          ) : (
            <textarea
              className="span-2"
              value={channelForm.recipients}
              onChange={(event) => setChannelForm((current) => ({ ...current, recipients: event.target.value }))}
              placeholder="收件人，逗号或换行分隔"
              rows={3}
            />
          )}
          <select
            value={channelForm.status}
            onChange={(event) => setChannelForm((current) => ({ ...current, status: event.target.value as 'ACTIVE' | 'INACTIVE' }))}
          >
            <option value="ACTIVE">启用</option>
            <option value="INACTIVE">停用</option>
          </select>
          <div className="btn-group">
            <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
              保存渠道
            </button>
          </div>
        </form>

        <div className="platform-api-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th>配置</th>
                <th>状态</th>
                <th>更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((item) => (
                <tr key={item.id}>
                  <td>{item.channel_type === 'FEISHU_ROBOT' ? '飞书' : '邮件'}</td>
                  <td>{item.name}</td>
                  <td>
                    {item.channel_type === 'EMAIL'
                      ? (item.config?.recipients || []).join(', ')
                      : item.config?.webhook_host || (item.secret_configured ? '已配置' : '-')}
                  </td>
                  <td>
                    <select
                      value={item.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}
                      onChange={(event) => updateChannelStatus(item, event.target.value as 'ACTIVE' | 'INACTIVE')}
                      disabled={saving}
                    >
                      <option value="ACTIVE">启用</option>
                      <option value="INACTIVE">停用</option>
                    </select>
                  </td>
                  <td>{formatTime(item.updated_at)}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => testChannel(item)} disabled={saving}>
                        测试
                      </button>
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => deleteChannel(item)} disabled={saving}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!channels.length && <div className="loading">暂无渠道</div>}
        </div>
      </section>

      <section className="card">
        <div className="platform-section-head">
          <div>
            <h3>{appId ? 'App 规则' : '全局规则'}</h3>
            <p>{rules.filter((item) => item.enabled).length} 个启用</p>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={saveRules} disabled={saving || !rules.length}>
            保存规则
          </button>
        </div>

        <div className="platform-api-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>事件</th>
                <th>启用</th>
                <th>阈值</th>
                <th>渠道</th>
                <th>去重</th>
                <th>聚合</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const catalogItem = catalog.find((item) => item.event_type === rule.event_type);
                return (
                  <tr key={rule.event_type}>
                    <td>
                      <strong>{catalogItem?.label || rule.event_type}</strong>
                      <div className="tenant-analytics-table-sub">{rule.event_type}</div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) => updateRule(rule.event_type, { enabled: event.target.checked })}
                      />
                    </td>
                    <td>
                      <select
                        value={rule.min_severity}
                        onChange={(event) => updateRule(rule.event_type, { min_severity: event.target.value as PlatformNotificationSeverity })}
                      >
                        {SEVERITIES.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={rule.channel_ids[0] || ''}
                        onChange={(event) => updateRule(rule.event_type, { channel_ids: event.target.value ? [event.target.value] : [] })}
                      >
                        <option value="">默认</option>
                        {activeChannels.map((channel) => (
                          <option key={channel.id} value={channel.id}>{channel.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={rule.dedupe_window_seconds}
                        onChange={(event) => updateRule(rule.event_type, { dedupe_window_seconds: Number(event.target.value || 0) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        value={rule.aggregation_window_seconds}
                        onChange={(event) => updateRule(rule.event_type, { aggregation_window_seconds: Number(event.target.value || 0) })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rules.length && <div className="loading">暂无规则</div>}
        </div>
      </section>

      <section className="card">
        <div className="platform-section-head">
          <div>
            <h3>最近事件</h3>
            <p>{events.length} 条</p>
          </div>
        </div>
        <div className="platform-api-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>级别</th>
                <th>事件</th>
                <th>来源</th>
                <th>状态</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {events.map((item) => (
                <tr key={item.id}>
                  <td><span className={`status-tag ${severityClass(item.severity)}`}>{item.severity}</span></td>
                  <td>
                    <strong>{item.title}</strong>
                    <div className="tenant-analytics-table-sub">{item.event_type}</div>
                  </td>
                  <td>{item.source_module || '-'}{item.source_id ? ` / ${item.source_id}` : ''}</td>
                  <td><span className={`status-tag ${statusClass(item.status)}`}>{item.status}</span></td>
                  <td>{formatTime(item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!events.length && <div className="loading">暂无事件</div>}
        </div>
      </section>

      <section className="card">
        <div className="platform-section-head">
          <div>
            <h3>最近投递</h3>
            <p>{deliveries.length} 条</p>
          </div>
        </div>
        <div className="platform-api-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>状态</th>
                <th>渠道</th>
                <th>事件</th>
                <th>次数</th>
                <th>错误</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((item) => (
                <tr key={item.id}>
                  <td><span className={`status-tag ${statusClass(item.status)}`}>{item.status}</span></td>
                  <td>{item.channel_name || item.channel_type || '-'}</td>
                  <td>{item.title || item.event_type || '-'}</td>
                  <td>{item.attempts}</td>
                  <td>{item.error_message || '-'}</td>
                  <td>{formatTime(item.sent_at || item.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!deliveries.length && <div className="loading">暂无投递</div>}
        </div>
      </section>
    </div>
  );
}
