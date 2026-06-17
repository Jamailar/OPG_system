import { useEffect, useMemo, useState } from 'react';
import {
  PlatformObservabilityAuditEvent,
  PlatformObservabilityEventsResponse,
  PlatformObservabilityRequestEvent,
  platformApi,
} from '@/lib/api';
import { pickApiData, pickApiErrorMessage } from '@/lib/api-response';

type ViewMode = 'requests' | 'audit';

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function statusClass(status?: number | null) {
  if (!status) return 'info';
  if (status >= 500) return 'error';
  if (status >= 400) return 'warning';
  return 'success';
}

export default function PlatformObservabilityPage() {
  const [mode, setMode] = useState<ViewMode>('requests');
  const [requestId, setRequestId] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [requestEvents, setRequestEvents] = useState<PlatformObservabilityRequestEvent[]>([]);
  const [auditEvents, setAuditEvents] = useState<PlatformObservabilityAuditEvent[]>([]);

  const query = useMemo(
    () => ({
      request_id: requestId.trim() || undefined,
      module: moduleFilter.trim() || undefined,
      days: '7',
      page_size: 80,
    }),
    [moduleFilter, requestId],
  );

  const loadData = async () => {
    setLoading(true);
    setMessage('');
    try {
      if (mode === 'requests') {
        const payload = pickApiData<PlatformObservabilityEventsResponse<PlatformObservabilityRequestEvent>>(
          await platformApi.listPlatformRequestEvents(query),
        );
        setRequestEvents(payload?.items || []);
      } else {
        const payload = pickApiData<PlatformObservabilityEventsResponse<PlatformObservabilityAuditEvent>>(
          await platformApi.listPlatformAuditEvents(query),
        );
        setAuditEvents(payload?.items || []);
      }
    } catch (error: unknown) {
      setMessage(pickApiErrorMessage(error, '加载观测数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [mode]);

  return (
    <div className="platform-page">
      <div className="platform-page-head">
        <div>
          <h1>运行观测</h1>
          <p>请求事件、错误和审计记录。</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {message && <div className="alert alert-error">{message}</div>}

      <section className="card">
        <div className="ai-hub-filter-row">
          <div className="segmented-control">
            <button className={mode === 'requests' ? 'active' : ''} onClick={() => setMode('requests')} type="button">
              请求
            </button>
            <button className={mode === 'audit' ? 'active' : ''} onClick={() => setMode('audit')} type="button">
              审计
            </button>
          </div>
          <input
            className="platform-filter-input"
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') loadData();
            }}
            placeholder="request id"
          />
          <input
            className="platform-filter-input"
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') loadData();
            }}
            placeholder="module"
          />
          <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading} type="button">
            查询
          </button>
        </div>

        {mode === 'requests' ? (
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模块</th>
                  <th>状态</th>
                  <th>路径</th>
                  <th>耗时</th>
                  <th>Request</th>
                </tr>
              </thead>
              <tbody>
                {requestEvents.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.created_at)}</td>
                    <td>{item.module}</td>
                    <td>
                      <span className={`status-tag ${statusClass(item.status_code)}`}>
                        {item.status_code || (item.success === false ? 'ERR' : 'OK')}
                      </span>
                    </td>
                    <td>{item.request_path || item.operation || '-'}</td>
                    <td>{item.latency_ms === null || item.latency_ms === undefined ? '-' : `${item.latency_ms} ms`}</td>
                    <td>
                      <code>{item.request_id || '-'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!requestEvents.length && <div className="loading">暂无请求事件</div>}
          </div>
        ) : (
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>模块</th>
                  <th>动作</th>
                  <th>资源</th>
                  <th>Actor</th>
                  <th>Request</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.created_at)}</td>
                    <td>{item.module}</td>
                    <td>{item.action}</td>
                    <td>
                      {item.resource_type}
                      {item.resource_id ? ` / ${item.resource_id}` : ''}
                    </td>
                    <td>
                      <code>{item.actor_user_id || '-'}</code>
                    </td>
                    <td>
                      <code>{item.request_id || '-'}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!auditEvents.length && <div className="loading">暂无审计事件</div>}
          </div>
        )}
      </section>
    </div>
  );
}
