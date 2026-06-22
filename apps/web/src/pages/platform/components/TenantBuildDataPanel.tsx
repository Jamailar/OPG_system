import { useEffect, useMemo, useState } from 'react';
import { platformApi } from '@/lib/api';
import type { PlatformAppBuildEventItem, PlatformAppBuildSummary, PlatformAppSchemaManifest, PlatformAppSchemaTable } from '@/lib/api';
import { pickApiErrorMessage } from '@/lib/api-response';

type Message = { type: 'success' | 'error'; text: string } | null;

interface TenantBuildDataPanelProps {
  appId: string;
  appSlug?: string;
  onMessage?: (message: Message) => void;
}

const DATA_TYPES = ['text', 'integer', 'bigint', 'numeric', 'boolean', 'uuid', 'jsonb', 'timestamptz', 'date'];

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  DELETED: '已删除',
  PENDING: '待处理',
  FAILED: '失败',
};

const SOURCE_LABELS: Record<string, string> = {
  schema: '数据结构',
  function: '函数',
  workflow: '工作流',
  ai: 'AI',
  video: '视频',
};

const EVENT_LABELS: Record<string, string> = {
  'schema.table.created': '创建数据表',
  'schema.table.deleted': '删除数据表',
  'schema.column.created': '新增字段',
  'schema.policy.created': '新增策略',
  'schema.policy.updated': '更新策略',
  'data.row.created': '新增数据',
  'data.row.updated': '更新数据',
  'data.row.deleted': '删除数据',
  SUCCEEDED: '成功',
  SUCCESS: '成功',
  FAILED: '失败',
  RUNNING: '运行中',
  PENDING: '等待中',
  QUEUED: '排队中',
  CANCELLED: '已取消',
};

const RESOURCE_LABELS: Record<string, string> = {
  table: '数据表',
  column: '字段',
  policy: '策略',
  data_row: '数据行',
  function_run: '函数运行',
  workflow_run: '工作流运行',
  ai_run: 'AI 调用',
  video_job: '视频任务',
};

function parseColumnSpecs(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name, dataType = 'text'] = item.split(':').map((part) => part.trim());
      return { name, data_type: dataType || 'text' };
    });
}

function formatStatus(status?: string | null) {
  const key = String(status || '').toUpperCase();
  return STATUS_LABELS[key] || status || '-';
}

function statusClass(status?: string | null) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'SUCCEEDED' || normalized === 'SUCCESS') return 'success';
  if (normalized === 'FAILED' || normalized === 'ERROR') return 'error';
  if (normalized === 'RUNNING') return 'info';
  return 'warning';
}

function formatSource(source?: string | null) {
  return SOURCE_LABELS[String(source || '').toLowerCase()] || source || '-';
}

function formatEvent(event?: string | null) {
  const raw = String(event || '');
  return EVENT_LABELS[raw] || EVENT_LABELS[raw.toUpperCase()] || raw || '-';
}

function formatResource(resourceType?: string | null) {
  return RESOURCE_LABELS[String(resourceType || '').toLowerCase()] || resourceType || '-';
}

function formatBool(value?: boolean | null) {
  return value ? '是' : '否';
}

function BooleanSegment({
  value,
  trueLabel,
  falseLabel,
  onChange,
}: {
  value: boolean;
  trueLabel: string;
  falseLabel: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="build-data-segmented" role="group">
      <button type="button" className={value ? 'active' : ''} aria-pressed={value} onClick={() => onChange(true)}>
        {trueLabel}
      </button>
      <button type="button" className={!value ? 'active' : ''} aria-pressed={!value} onClick={() => onChange(false)}>
        {falseLabel}
      </button>
    </div>
  );
}

export default function TenantBuildDataPanel({ appId, appSlug, onMessage }: TenantBuildDataPanelProps) {
  const [manifest, setManifest] = useState<PlatformAppSchemaManifest | null>(null);
  const [buildSummary, setBuildSummary] = useState<PlatformAppBuildSummary | null>(null);
  const [buildEvents, setBuildEvents] = useState<PlatformAppBuildEventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [savingColumn, setSavingColumn] = useState(false);
  const [selectedTableSlug, setSelectedTableSlug] = useState('');
  const [tableForm, setTableForm] = useState({
    name: '',
    columns: 'email:text,name:text',
    soft_delete: true,
  });
  const [columnForm, setColumnForm] = useState({
    name: '',
    data_type: 'text',
    nullable: true,
    indexed: false,
  });

  const tables = manifest?.schema?.tables || [];
  const selectedTable = useMemo<PlatformAppSchemaTable | null>(
    () => tables.find((table) => table.slug === selectedTableSlug) || tables[0] || null,
    [selectedTableSlug, tables],
  );

  const loadManifest = async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const nextManifest = await platformApi.getAppSchemaManifest(appId);
      setManifest(nextManifest);
      const [summary, events] = await Promise.all([
        platformApi.getAppBuildSummary(appId).catch(() => null),
        platformApi.getAppBuildEvents(appId, 12).catch(() => ({ items: [] })),
      ]);
      setBuildSummary(summary);
      setBuildEvents(events.items || []);
      if (!selectedTableSlug && nextManifest.schema.tables[0]) {
        setSelectedTableSlug(nextManifest.schema.tables[0].slug);
      }
    } catch (error) {
      onMessage?.({ type: 'error', text: pickApiErrorMessage(error, '加载数据结构失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadManifest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  const createTable = async () => {
    if (!tableForm.name.trim()) {
      onMessage?.({ type: 'error', text: '请填写表名' });
      return;
    }
    setSavingTable(true);
    try {
      await platformApi.createAppDataTable(appId, {
        name: tableForm.name,
        columns: parseColumnSpecs(tableForm.columns),
        soft_delete: tableForm.soft_delete,
        dry_run: false,
      });
      setTableForm({ name: '', columns: 'email:text,name:text', soft_delete: true });
      onMessage?.({ type: 'success', text: '数据表已创建' });
      await loadManifest();
    } catch (error) {
      onMessage?.({ type: 'error', text: pickApiErrorMessage(error, '创建数据表失败') });
    } finally {
      setSavingTable(false);
    }
  };

  const addColumn = async () => {
    if (!selectedTable || !columnForm.name.trim()) {
      onMessage?.({ type: 'error', text: '请选择表并填写字段名' });
      return;
    }
    setSavingColumn(true);
    try {
      await platformApi.addAppDataColumn(appId, selectedTable.slug, {
        name: columnForm.name,
        data_type: columnForm.data_type,
        nullable: columnForm.nullable,
        indexed: columnForm.indexed,
        dry_run: false,
      });
      setColumnForm({ name: '', data_type: 'text', nullable: true, indexed: false });
      onMessage?.({ type: 'success', text: '字段已添加' });
      await loadManifest();
    } catch (error) {
      onMessage?.({ type: 'error', text: pickApiErrorMessage(error, '添加字段失败') });
    } finally {
      setSavingColumn(false);
    }
  };

  const summary = buildSummary?.summary || {};
  const schemaEvents = Number(summary.schema_events || 0);
  const functionRuns = Number(summary.function_runs || 0);
  const workflowRuns = Number(summary.workflow_runs || 0);
  const appSlugForExamples = appSlug || manifest?.app.slug || ':app';

  return (
    <div className="tenant-section-stack build-data-panel">
      <section className="build-data-overview">
        <div className="build-data-overview-copy">
          <span>数据构建</span>
          <h3>表结构与数据接口</h3>
          <p>{manifest ? `${manifest.namespace} · ${tables.length} 张表` : '正在读取结构注册表'}</p>
        </div>
        <div className="build-data-overview-metrics">
          <div>
            <span>数据表</span>
            <strong>{tables.length}</strong>
          </div>
          <div>
            <span>结构事件</span>
            <strong>{schemaEvents}</strong>
          </div>
          <div>
            <span>函数运行</span>
            <strong>{functionRuns}</strong>
          </div>
          <div>
            <span>工作流</span>
            <strong>{workflowRuns}</strong>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm build-data-refresh" type="button" onClick={loadManifest} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </section>

      <section className="build-data-block">
        <div className="build-data-block-head">
          <div>
            <h3>创建数据表</h3>
            <p>一次定义表名、字段和软删除策略</p>
          </div>
        </div>

        <div className="build-data-form build-data-create-form">
          <label className="build-data-field">
            <span>表名</span>
            <input
              className="build-data-input"
              value={tableForm.name}
              onChange={(event) => setTableForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="customers"
            />
          </label>
          <label className="build-data-field build-data-field-wide">
            <span>字段定义</span>
            <input
              className="build-data-input"
              value={tableForm.columns}
              onChange={(event) => setTableForm((prev) => ({ ...prev, columns: event.target.value }))}
              placeholder="email:text,name:text"
            />
          </label>
          <label className="build-data-field">
            <span>软删除</span>
            <BooleanSegment
              value={tableForm.soft_delete}
              trueLabel="开启"
              falseLabel="关闭"
              onChange={(value) => setTableForm((prev) => ({ ...prev, soft_delete: value }))}
            />
          </label>
          <div className="build-data-form-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={createTable} disabled={savingTable}>
              {savingTable ? '创建中...' : '创建表'}
            </button>
          </div>
        </div>
      </section>

      <section className="build-data-block">
        <div className="build-data-block-head">
          <div>
            <h3>数据表</h3>
            <p>{selectedTable ? selectedTable.physical_table_name : '暂无自定义表'}</p>
          </div>
        </div>

        <div className="build-data-workbench">
          <div className="build-data-table-area">
            <div className="platform-api-table-wrap build-data-table-wrap">
              <table className="table build-data-table">
                <thead>
                  <tr>
                    <th>表</th>
                    <th>字段数</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((table) => (
                    <tr key={table.id} className={selectedTable?.id === table.id ? 'table-row-selected' : ''} onClick={() => setSelectedTableSlug(table.slug)}>
                      <td>
                        <strong>{table.display_name || table.slug}</strong>
                        <span>{table.slug}</span>
                      </td>
                      <td>{table.columns.length}</td>
                      <td><span className={`status-tag ${statusClass(table.status)}`}>{formatStatus(table.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!tables.length && <div className="loading">暂无自定义表</div>}
            </div>
          </div>

          <div className="build-data-field-editor">
            <div className="build-data-editor-head">
              <span>添加字段</span>
              <strong>{selectedTable?.slug || '未选择表'}</strong>
            </div>
            <div className="build-data-form build-data-column-form">
              <label className="build-data-field">
                <span>目标表</span>
                <select
                  className="build-data-select"
                  value={selectedTable?.slug || ''}
                  onChange={(event) => setSelectedTableSlug(event.target.value)}
                  disabled={!tables.length}
                >
                  {!tables.length && <option value="">暂无数据表</option>}
                  {tables.map((table) => <option key={table.id} value={table.slug}>{table.slug}</option>)}
                </select>
              </label>
              <label className="build-data-field">
                <span>字段名</span>
                <input
                  className="build-data-input"
                  value={columnForm.name}
                  onChange={(event) => setColumnForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="phone"
                />
              </label>
              <label className="build-data-field">
                <span>类型</span>
                <select className="build-data-select" value={columnForm.data_type} onChange={(event) => setColumnForm((prev) => ({ ...prev, data_type: event.target.value }))}>
                  {DATA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="build-data-field">
                <span>可为空</span>
                <BooleanSegment
                  value={columnForm.nullable}
                  trueLabel="允许"
                  falseLabel="必填"
                  onChange={(value) => setColumnForm((prev) => ({ ...prev, nullable: value }))}
                />
              </label>
              <label className="build-data-field">
                <span>索引</span>
                <BooleanSegment
                  value={columnForm.indexed}
                  trueLabel="开启"
                  falseLabel="关闭"
                  onChange={(value) => setColumnForm((prev) => ({ ...prev, indexed: value }))}
                />
              </label>
              <div className="build-data-form-actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={addColumn} disabled={savingColumn || !selectedTable}>
                  {savingColumn ? '添加中...' : '添加字段'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedTable && (
        <section className="build-data-block">
          <div className="build-data-block-head">
            <div>
              <h3>{selectedTable.display_name || selectedTable.slug}</h3>
              <p>{selectedTable.columns.length} 个字段 · {selectedTable.physical_table_name}</p>
            </div>
          </div>
          <div className="platform-api-table-wrap build-data-table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>字段</th>
                  <th>类型</th>
                  <th>可为空</th>
                  <th>索引</th>
                </tr>
              </thead>
              <tbody>
                {selectedTable.columns.map((column) => (
                  <tr key={column.id}>
                    <td><code>{column.slug}</code></td>
                    <td>{column.data_type}</td>
                    <td>{formatBool(column.is_nullable)}</td>
                    <td>{formatBool(column.is_indexed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="build-data-api-strip">
            <div>
              <span>数据接口</span>
              <strong>{selectedTable.slug}</strong>
            </div>
            <pre>{[
              `GET /${appSlugForExamples}/v1/data/${selectedTable.slug}`,
              `POST /${appSlugForExamples}/v1/data/${selectedTable.slug}`,
              `opg.data.table('${selectedTable.slug}').list()`,
            ].join('\n')}</pre>
          </div>
        </section>
      )}

      <section className="build-data-block">
        <div className="build-data-block-head">
          <div>
            <h3>活动日志</h3>
            <p>{buildSummary ? `${schemaEvents} 个结构事件 · ${functionRuns} 次函数运行 · ${workflowRuns} 次工作流` : '-'}</p>
          </div>
        </div>
        <div className="platform-api-table-wrap build-data-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>来源</th>
                <th>事件</th>
                <th>资源</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {buildEvents.map((event) => (
                <tr key={`${event.source}-${event.resource_id}-${event.created_at}`}>
                  <td>{formatSource(event.source)}</td>
                  <td>{formatEvent(event.event)}</td>
                  <td>{formatResource(event.resource_type)}</td>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!buildEvents.length && <div className="loading">暂无事件</div>}
        </div>
      </section>
    </div>
  );
}
