import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlatformAppItem, PlatformObservabilityRuntime, platformApi } from '@/lib/api';
import { pickApiData, pickApiErrorMessage } from '@/lib/api-response';

export default function PlatformDashboard() {
  const [loading, setLoading] = useState(false);
  const [apps, setApps] = useState<PlatformAppItem[]>([]);
  const [observability, setObservability] = useState<PlatformObservabilityRuntime | null>(null);
  const [error, setError] = useState('');

  const fetchApps = async () => {
    setLoading(true);
    setError('');
    try {
      const [appsPayload, observabilityPayload] = await Promise.all([
        platformApi.listApps(true),
        platformApi.getPlatformObservabilityRuntime().catch(() => null),
      ]);
      const nextApps = pickApiData<{ items: PlatformAppItem[] }>(appsPayload);
      setApps(nextApps?.items || []);
      setObservability(observabilityPayload ? pickApiData<PlatformObservabilityRuntime>(observabilityPayload) : null);
    } catch (e: any) {
      setError(pickApiErrorMessage(e, '加载平台数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const stats = useMemo(() => {
    const total = apps.length;
    const active = apps.filter((item) => item.status === 'ACTIVE').length;
    const inactive = total - active;
    const totalDomains = apps.reduce((sum, item) => sum + (item.domains?.length || 0), 0);
    return { total, active, inactive, totalDomains };
  }, [apps]);

  const recentApps = useMemo(
    () =>
      [...apps]
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
        .slice(0, 8),
    [apps],
  );

  const observabilityStats = useMemo(() => {
    const modules = observability?.modules || [];
    const events = modules.reduce((sum, item) => sum + Number(item.events_count || 0), 0);
    const failures = modules.reduce((sum, item) => sum + Number(item.failures_count || 0), 0);
    const slow = modules.reduce((sum, item) => sum + Number(item.slow_count || 0), 0);
    const activeModules = modules.length;
    return { events, failures, slow, activeModules };
  }, [observability]);

  return (
    <div className="platform-page">
      <div className="platform-page-head">
        <div>
          <h1>平台概览</h1>
          <p>快速查看租户规模、活跃状态与最近更新。</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchApps} disabled={loading}>
          {loading ? '刷新中...' : '刷新数据'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="platform-stats-grid">
        <div className="platform-stat-card">
          <span>租户总数</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="platform-stat-card">
          <span>启用应用</span>
          <strong>{stats.active}</strong>
        </div>
        <div className="platform-stat-card">
          <span>停用应用</span>
          <strong>{stats.inactive}</strong>
        </div>
        <div className="platform-stat-card">
          <span>已配置域名</span>
          <strong>{stats.totalDomains}</strong>
        </div>
      </div>

      <div className="platform-grid-two">
        <section className="card">
          <div className="platform-section-head">
            <h3>运行观测</h3>
            <Link to="/platform-admin/observability" className="btn btn-secondary btn-sm">
              详情
            </Link>
          </div>
          <div className="platform-stats-grid compact">
            <div className="platform-stat-card">
              <span>1 小时事件</span>
              <strong>{observabilityStats.events}</strong>
            </div>
            <div className="platform-stat-card">
              <span>失败</span>
              <strong>{observabilityStats.failures}</strong>
            </div>
            <div className="platform-stat-card">
              <span>慢请求</span>
              <strong>{observabilityStats.slow}</strong>
            </div>
            <div className="platform-stat-card">
              <span>模块</span>
              <strong>{observabilityStats.activeModules}</strong>
            </div>
          </div>
          <div className="platform-list">
            {(observability?.recent_errors || []).slice(0, 6).map((item) => (
              <div className="platform-list-item" key={item.id}>
                <div>
                  <strong>{item.module}</strong>
                  <p>
                    {item.status_code || '-'} · <code>{item.request_id || item.id}</code>
                  </p>
                </div>
                <span className="status-tag error">{item.error_category || 'error'}</span>
              </div>
            ))}
            {observability?.schema_ready && !(observability?.recent_errors || []).length && <div className="loading">暂无错误事件</div>}
            {observability && !observability.schema_ready && <div className="loading">观测表未就绪</div>}
            {!observability && <div className="loading">暂无观测数据</div>}
          </div>
        </section>

        <section className="card">
          <div className="platform-section-head">
            <h3>最近更新的租户应用</h3>
            <Link to="/platform-admin/apps" className="btn btn-secondary btn-sm">
              去管理
            </Link>
          </div>
          <div className="platform-list">
            {recentApps.map((item) => (
              <div className="platform-list-item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    slug: <code>{item.slug}</code>
                  </p>
                </div>
                <span className={`status-tag ${item.status === 'ACTIVE' ? 'success' : 'warning'}`}>
                  {item.status}
                </span>
              </div>
            ))}
            {!recentApps.length && <div className="loading">暂无租户应用</div>}
          </div>
        </section>

        <section className="card">
          <div className="platform-section-head">
            <h3>平台管理入口</h3>
          </div>
          <div className="platform-shortcuts">
            <Link to="/platform-admin/apps" className="platform-shortcut">
              <strong>租户应用管理</strong>
              <span>创建/编辑应用、域名和品牌配置</span>
            </Link>
            <Link to="/platform-admin/ai" className="platform-shortcut">
              <strong>全局 AI 源与模型</strong>
              <span>维护平台共享的 AI 供应商和模型目录</span>
            </Link>
            <Link to="/platform-admin/payments" className="platform-shortcut">
              <strong>支付方式与链路测试</strong>
              <span>统一维护支付宝/微信配置并执行全链路联调</span>
            </Link>
            <Link to="/platform-admin/sms" className="platform-shortcut">
              <strong>短信服务与签名</strong>
              <span>统一配置短信通道、签名和模板参数</span>
            </Link>
            <Link to="/platform-admin/apis" className="platform-shortcut">
              <strong>共享 API 列表</strong>
              <span>查看所有共享端点与中文说明</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
