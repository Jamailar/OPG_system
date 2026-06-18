import { useEffect, useMemo, useState } from 'react';
import {
  PlatformAppItem,
  PlatformEmailCloudflareSendingDomain,
  PlatformEmailCloudflareTokenAccount,
  PlatformEmailProviderItem,
  PlatformEmailProviderType,
  PlatformEmailSenderItem,
  platformApi,
} from '@/lib/api';
import { pickApiErrorMessage } from '@/lib/api-response';

type ModalMode = 'provider' | 'sender' | 'sender-test' | '';

const EMPTY_PROVIDER_FORM = {
  id: '',
  provider_type: 'CLOUDFLARE_EMAIL' as PlatformEmailProviderType,
  name: '',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  notes: '',
  account_id: '',
  api_token: '',
  smtp_host: '',
  smtp_port: '465',
  smtp_secure: true,
  smtp_username: '',
  smtp_password: '',
  server_token: '',
  mailgun_domain: '',
  mailgun_api_base_url: 'https://api.mailgun.net',
};

const EMPTY_SENDER_FORM = {
  id: '',
  provider_id: '',
  app_id: '',
  email: '',
  display_name: '',
  purpose: 'both' as 'marketing' | 'notification' | 'both',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  is_default: false,
};

export default function PlatformEmailServicePage() {
  const [providers, setProviders] = useState<PlatformEmailProviderItem[]>([]);
  const [senders, setSenders] = useState<PlatformEmailSenderItem[]>([]);
  const [apps, setApps] = useState<PlatformAppItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('');
  const [providerForm, setProviderForm] = useState(EMPTY_PROVIDER_FORM);
  const [senderForm, setSenderForm] = useState(EMPTY_SENDER_FORM);
  const [testForm, setTestForm] = useState({ id: '', from: '', to: '' });
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [tokenAccounts, setTokenAccounts] = useState<PlatformEmailCloudflareTokenAccount[]>([]);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [senderDomains, setSenderDomains] = useState<PlatformEmailCloudflareSendingDomain[]>([]);
  const [loadingSenderDomains, setLoadingSenderDomains] = useState(false);
  const [providerTestResults, setProviderTestResults] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeProviders = useMemo(() => providers.filter((item) => item.status === 'ACTIVE'), [providers]);
  const selectedSenderProvider = useMemo(
    () => providers.find((item) => item.id === senderForm.provider_id),
    [providers, senderForm.provider_id],
  );
  const sendersByProviderId = useMemo(() => {
    const grouped = new Map<string, PlatformEmailSenderItem[]>();
    providers.forEach((provider) => grouped.set(provider.id, []));
    senders.forEach((sender) => {
      const providerSenders = grouped.get(sender.provider_id || '');
      if (providerSenders) providerSenders.push(sender);
    });
    return grouped;
  }, [providers, senders]);
  const unmatchedSenders = useMemo(() => {
    const providerIds = new Set(providers.map((provider) => provider.id));
    return senders.filter((sender) => !providerIds.has(sender.provider_id || ''));
  }, [providers, senders]);
  const availableSenderDomains = useMemo(() => {
    const currentDomain = emailDomain(senderForm.email);
    if (!currentDomain || senderDomains.some((item) => item.name === currentDomain)) return senderDomains;
    return [{ id: currentDomain, name: currentDomain, enabled: true, zone_id: '', zone_name: currentDomain }, ...senderDomains];
  }, [senderForm.email, senderDomains]);

  const loadData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [providerResp, senderResp, appResp] = await Promise.all([
        platformApi.listEmailProviders(),
        platformApi.listEmailSenders(),
        platformApi.listApps(true),
      ]);
      setProviders(providerResp.items || []);
      setSenders(senderResp.items || []);
      setApps(appResp.items || []);
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '加载邮件服务失败') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreateProvider = () => {
    setProviderForm(EMPTY_PROVIDER_FORM);
    setTokenAccounts([]);
    setTokenChecked(false);
    setModalMode('provider');
  };

  const openEditProvider = (item: PlatformEmailProviderItem) => {
    const config = item.config || {};
    setProviderForm({
      ...EMPTY_PROVIDER_FORM,
      id: item.id,
      provider_type: item.provider_type,
      name: item.name,
      status: item.status,
      notes: item.notes || '',
      account_id: String(config.account_id || item.external_account_id || ''),
      smtp_host: String(config.host || ''),
      smtp_port: String(config.port || 465),
      smtp_secure: config.secure === undefined ? true : !!config.secure,
      mailgun_domain: String(config.domain || ''),
      mailgun_api_base_url: String(config.api_base_url || 'https://api.mailgun.net'),
    });
    setTokenAccounts(item.provider_type === 'CLOUDFLARE_EMAIL' ? [{ id: String(config.account_id || item.external_account_id || ''), name: item.name, type: null }] : []);
    setTokenChecked(item.provider_type === 'CLOUDFLARE_EMAIL');
    setModalMode('provider');
  };

  const openCreateSender = (providerId?: string) => {
    setSenderForm({
      ...EMPTY_SENDER_FORM,
      provider_id: providerId || activeProviders[0]?.id || providers[0]?.id || '',
    });
    setSenderDomains([]);
    setModalMode('sender');
  };

  const openEditSender = (item: PlatformEmailSenderItem) => {
    setSenderForm({
      id: item.id,
      provider_id: item.provider_id || '',
      app_id: item.app_id || '',
      email: item.email,
      display_name: item.display_name || '',
      purpose: item.purpose,
      status: item.status,
      is_default: item.is_default,
    });
    setSenderDomains([]);
    setModalMode('sender');
  };

  useEffect(() => {
    if (modalMode !== 'sender' || !senderForm.provider_id) return;
    const provider = providers.find((item) => item.id === senderForm.provider_id);
    if (provider?.provider_type !== 'CLOUDFLARE_EMAIL') {
      setSenderDomains([]);
      return;
    }
    let cancelled = false;
    setLoadingSenderDomains(true);
    platformApi.listEmailProviderSendingDomains(senderForm.provider_id)
      .then((response) => {
        if (!cancelled) setSenderDomains(response.items || []);
      })
      .catch((error: any) => {
        if (!cancelled) {
          setSenderDomains([]);
          setMessage({ type: 'error', text: pickApiErrorMessage(error, '加载发件域名失败') });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSenderDomains(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalMode, providers, senderForm.provider_id]);

  const verifyCloudflareToken = async () => {
    if (!providerForm.api_token) {
      setMessage({ type: 'error', text: '请先填写 API Token' });
      return null;
    }
    setVerifyingToken(true);
    setMessage(null);
    try {
      const response = await platformApi.verifyEmailCloudflareToken({ api_token: providerForm.api_token });
      setTokenAccounts(response.accounts || []);
      setTokenChecked(true);
      if (response.accounts?.length === 1) {
        const account = response.accounts[0];
        setProviderForm((current) => ({ ...current, account_id: account.id, name: current.name || account.name }));
      }
      setMessage({ type: 'success', text: 'Cloudflare 令牌可用' });
      return response.accounts || [];
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '验证 Cloudflare 令牌失败') });
      return null;
    } finally {
      setVerifyingToken(false);
    }
  };

  const saveProvider = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (providerForm.provider_type === 'CLOUDFLARE_EMAIL' && providerForm.api_token && !providerForm.account_id) {
        const verifiedAccounts = await verifyCloudflareToken();
        if (!verifiedAccounts) return;
        if (verifiedAccounts.length > 1) {
          setMessage({ type: 'error', text: '请选择 Cloudflare 账号' });
          return;
        }
      }
      const payload = buildProviderPayload(providerForm);
      if (providerForm.id) {
        await platformApi.updateEmailProvider(providerForm.id, payload);
      } else {
        await platformApi.createEmailProvider(payload as any);
      }
      setModalMode('');
      setMessage({ type: 'success', text: '邮件供应商已保存' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '保存邮件供应商失败') });
    } finally {
      setSaving(false);
    }
  };

  const saveSender = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        provider_id: senderForm.provider_id,
        app_id: senderForm.app_id || null,
        email: senderForm.email,
        display_name: senderForm.display_name,
        purpose: senderForm.purpose,
        status: senderForm.status,
        is_default: senderForm.is_default,
      };
      if (senderForm.id) {
        await platformApi.updateEmailSender(senderForm.id, payload);
      } else {
        await platformApi.createEmailSender(payload);
      }
      setModalMode('');
      setMessage({ type: 'success', text: '发件邮箱已保存' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '保存发件邮箱失败') });
    } finally {
      setSaving(false);
    }
  };

  const testProvider = async (item: PlatformEmailProviderItem) => {
    setMessage(null);
    setProviderTestResults((current) => ({ ...current, [item.id]: { type: 'success', text: '正在测试...' } }));
    setSaving(true);
    try {
      await platformApi.testEmailProvider(item.id);
      setProviderTestResults((current) => ({ ...current, [item.id]: { type: 'success', text: `可用，${new Date().toLocaleString()}` } }));
      await loadData();
    } catch (error: any) {
      setProviderTestResults((current) => ({
        ...current,
        [item.id]: { type: 'error', text: pickApiErrorMessage(error, '测试邮件供应商失败') },
      }));
    } finally {
      setSaving(false);
    }
  };

  const openSenderTest = (item: PlatformEmailSenderItem) => {
    setTestForm({ id: item.id, from: item.email, to: '' });
    setModalMode('sender-test');
  };

  const testSender = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      await platformApi.testEmailSender(testForm.id, { to: testForm.to });
      setModalMode('');
      setMessage({ type: 'success', text: '测试邮件已发送' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '测试发送失败') });
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (item: PlatformEmailProviderItem) => {
    if (!window.confirm(`删除邮件供应商 ${item.name}？`)) return;
    setMessage(null);
    try {
      await platformApi.deleteEmailProvider(item.id);
      setMessage({ type: 'success', text: '邮件供应商已删除' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '删除邮件供应商失败') });
    }
  };

  const deleteSender = async (item: PlatformEmailSenderItem) => {
    if (!window.confirm(`删除发件邮箱 ${item.email}？`)) return;
    setMessage(null);
    try {
      await platformApi.deleteEmailSender(item.id);
      setMessage({ type: 'success', text: '发件邮箱已删除' });
      await loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: pickApiErrorMessage(error, '删除发件邮箱失败') });
    }
  };

  return (
    <div className="platform-page email-service-page">
      <div className="platform-page-head">
        <div>
          <h1>邮件服务</h1>
          <p>配置邮件供应商、发件邮箱和租户邮件发送能力。</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => void loadData()} disabled={loading}>
            {loading ? '刷新中...' : '刷新'}
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={openCreateProvider}>
            新建供应商
          </button>
          <button className="btn btn-sm" type="button" onClick={() => openCreateSender()}>
            新建发件邮箱
          </button>
        </div>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <section className="email-service-summary">
        <div><span>供应商</span><strong>{providers.length}</strong></div>
        <div><span>可用供应商</span><strong>{activeProviders.length}</strong></div>
        <div><span>发件邮箱</span><strong>{senders.length}</strong></div>
        <div><span>租户绑定</span><strong>{senders.filter((item) => item.app_id).length}</strong></div>
      </section>

      <section className="email-account-groups">
        {providers.map((provider) => {
          const providerSenders = sendersByProviderId.get(provider.id) || [];
          return (
            <article className="card email-account-group" key={provider.id}>
              <div className="email-account-head">
                <div className="email-account-main">
                  <div>
                    <h3>{provider.name}</h3>
                    <code>{providerLabel(provider.provider_type)}{provider.external_account_id ? ` · ${provider.external_account_id}` : ''}</code>
                  </div>
                  <span className={`status-tag ${provider.status === 'ACTIVE' ? 'success' : 'muted'}`}>{provider.status}</span>
                  <span className="muted-text">
                    最近测试：{provider.last_verified_at ? new Date(provider.last_verified_at).toLocaleString() : '-'}
                  </span>
                </div>
                <div className="btn-group email-account-actions">
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => openEditProvider(provider)}>编辑</button>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => void testProvider(provider)} disabled={saving}>测试</button>
                  <button className="btn btn-sm" type="button" onClick={() => openCreateSender(provider.id)}>新建邮箱</button>
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => void deleteProvider(provider)}>删除</button>
                </div>
              </div>
              {providerTestResults[provider.id] && (
                <div className={`email-inline-result ${providerTestResults[provider.id].type}`}>
                  {providerTestResults[provider.id].text}
                </div>
              )}

              <div className="email-sender-list">
                {providerSenders.map((sender) => (
                  <div className="email-sender-row" key={sender.id}>
                    <div className="email-sender-main">
                      <strong>{sender.display_name || sender.email}</strong>
                      <span>{sender.email}</span>
                    </div>
                    <span>{sender.app_slug || '全局'}</span>
                    <span>{purposeLabel(sender.purpose)}</span>
                    <span className={`status-tag ${sender.status === 'ACTIVE' ? 'success' : 'muted'}`}>{sender.status}</span>
                    <div className="btn-group">
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => openEditSender(sender)}>编辑</button>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => openSenderTest(sender)}>测试</button>
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => void deleteSender(sender)}>删除</button>
                    </div>
                  </div>
                ))}
                {!providerSenders.length && <div className="email-empty-row">暂无发件邮箱</div>}
              </div>
            </article>
          );
        })}

        {!providers.length && (
          <section className="card email-empty-card">
            <h3>暂无邮件供应商</h3>
            <button className="btn btn-sm" type="button" onClick={openCreateProvider}>新建供应商</button>
          </section>
        )}

        {!!unmatchedSenders.length && (
          <article className="card email-account-group">
            <div className="email-account-head">
              <div className="email-account-main">
                <h3>未归属发件邮箱</h3>
                <span className="muted-text">{unmatchedSenders.length} 个邮箱需要重新选择供应商</span>
              </div>
            </div>
            <div className="email-sender-list">
              {unmatchedSenders.map((sender) => (
                <div className="email-sender-row" key={sender.id}>
                  <div className="email-sender-main">
                    <strong>{sender.display_name || sender.email}</strong>
                    <span>{sender.email}</span>
                  </div>
                  <span>{sender.app_slug || '全局'}</span>
                  <span>{purposeLabel(sender.purpose)}</span>
                  <span className={`status-tag ${sender.status === 'ACTIVE' ? 'success' : 'muted'}`}>{sender.status}</span>
                  <div className="btn-group">
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => openEditSender(sender)}>编辑</button>
                    <button className="btn btn-danger btn-sm" type="button" onClick={() => void deleteSender(sender)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        )}
      </section>

      {modalMode === 'provider' && (
        <div className="modal-overlay" onMouseDown={() => setModalMode('')}>
          <form className="modal modal-lg email-service-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveProvider}>
            <div className="platform-section-head">
              <h3>{providerForm.id ? '编辑邮件供应商' : '新建邮件供应商'}</h3>
            </div>
            <label>供应商<select value={providerForm.provider_type} onChange={(event) => setProviderForm({ ...EMPTY_PROVIDER_FORM, provider_type: event.target.value as PlatformEmailProviderType })} disabled={!!providerForm.id}>
              <option value="CLOUDFLARE_EMAIL">Cloudflare Email Sending</option>
              <option value="SMTP">SMTP</option>
              <option value="RESEND">Resend</option>
              <option value="SENDGRID">SendGrid</option>
              <option value="POSTMARK">Postmark</option>
              <option value="MAILGUN">Mailgun</option>
            </select></label>
            {providerForm.provider_type === 'CLOUDFLARE_EMAIL' && (
              <>
                <div className="email-service-link-row">
                  <a href="https://dash.cloudflare.com/" target="_blank" rel="noreferrer">打开 Cloudflare</a>
                  <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">创建 Token</a>
                </div>
                <label>API Token<input type="password" autoComplete="current-password" value={providerForm.api_token} onChange={(event) => {
                  setProviderForm({ ...providerForm, api_token: event.target.value, account_id: providerForm.id ? providerForm.account_id : '' });
                  setTokenAccounts(providerForm.id ? tokenAccounts : []);
                  setTokenChecked(Boolean(providerForm.id));
                }} required={!providerForm.id} placeholder={providerForm.id ? '留空则不修改' : ''} /></label>
                <button className="btn btn-secondary btn-sm email-token-test-button" type="button" onClick={() => void verifyCloudflareToken()} disabled={verifyingToken || !providerForm.api_token}>
                  {verifyingToken ? '验证中...' : '验证令牌'}
                </button>
                {!!tokenAccounts.length && (
                  <label>Cloudflare 账号<select value={providerForm.account_id} onChange={(event) => {
                    const selected = tokenAccounts.find((item) => item.id === event.target.value);
                    setProviderForm({ ...providerForm, account_id: event.target.value, name: providerForm.name || selected?.name || '' });
                  }} required>
                    <option value="">请选择</option>
                    {tokenAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select></label>
                )}
                {tokenChecked && !tokenAccounts.length && (
                  <details className="email-account-id-fallback">
                    <summary>手动填写 Account ID</summary>
                    <label>Account ID<input value={providerForm.account_id} onChange={(event) => setProviderForm({ ...providerForm, account_id: event.target.value.trim() })} placeholder="例如 0998d32bbb869d9bb21c5d9788fb04e4" pattern="[0-9a-fA-F]{32}" /></label>
                  </details>
                )}
              </>
            )}
            {providerForm.provider_type === 'SMTP' && (
              <>
                <label>Host<input value={providerForm.smtp_host} onChange={(event) => setProviderForm({ ...providerForm, smtp_host: event.target.value })} required /></label>
                <label>Port<input value={providerForm.smtp_port} onChange={(event) => setProviderForm({ ...providerForm, smtp_port: event.target.value })} required /></label>
                <label>Secure<select value={providerForm.smtp_secure ? 'true' : 'false'} onChange={(event) => setProviderForm({ ...providerForm, smtp_secure: event.target.value === 'true' })}><option value="true">SSL/TLS</option><option value="false">STARTTLS</option></select></label>
                <label>Username<input value={providerForm.smtp_username} onChange={(event) => setProviderForm({ ...providerForm, smtp_username: event.target.value })} required={!providerForm.id} /></label>
                <label>Password<input type="password" value={providerForm.smtp_password} onChange={(event) => setProviderForm({ ...providerForm, smtp_password: event.target.value })} required={!providerForm.id} placeholder={providerForm.id ? '留空则不修改' : ''} /></label>
              </>
            )}
            {['RESEND', 'SENDGRID'].includes(providerForm.provider_type) && (
              <label>API Key<input type="password" value={providerForm.api_token} onChange={(event) => setProviderForm({ ...providerForm, api_token: event.target.value })} required={!providerForm.id} placeholder={providerForm.id ? '留空则不修改' : ''} /></label>
            )}
            {providerForm.provider_type === 'POSTMARK' && (
              <label>Server Token<input type="password" value={providerForm.server_token} onChange={(event) => setProviderForm({ ...providerForm, server_token: event.target.value })} required={!providerForm.id} placeholder={providerForm.id ? '留空则不修改' : ''} /></label>
            )}
            {providerForm.provider_type === 'MAILGUN' && (
              <>
                <label>Domain<input value={providerForm.mailgun_domain} onChange={(event) => setProviderForm({ ...providerForm, mailgun_domain: event.target.value })} required /></label>
                <label>API Base URL<input value={providerForm.mailgun_api_base_url} onChange={(event) => setProviderForm({ ...providerForm, mailgun_api_base_url: event.target.value })} /></label>
                <label>API Key<input type="password" value={providerForm.api_token} onChange={(event) => setProviderForm({ ...providerForm, api_token: event.target.value })} required={!providerForm.id} placeholder={providerForm.id ? '留空则不修改' : ''} /></label>
              </>
            )}
            <label>名称<input value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} placeholder="默认使用账号或服务名称" /></label>
            <label>状态<select value={providerForm.status} onChange={(event) => setProviderForm({ ...providerForm, status: event.target.value as 'ACTIVE' | 'INACTIVE' })}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
            <label>备注<textarea rows={3} value={providerForm.notes} onChange={(event) => setProviderForm({ ...providerForm, notes: event.target.value })} /></label>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setModalMode('')}>取消</button>
              <button className="btn btn-sm" type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </form>
        </div>
      )}

      {modalMode === 'sender' && (
        <div className="modal-overlay" onMouseDown={() => setModalMode('')}>
          <form className="modal modal-lg email-service-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveSender}>
            <div className="platform-section-head">
              <h3>{senderForm.id ? '编辑发件邮箱' : '新建发件邮箱'}</h3>
            </div>
            <label>供应商<select value={senderForm.provider_id} onChange={(event) => setSenderForm({ ...senderForm, provider_id: event.target.value })} required>{providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>租户<select value={senderForm.app_id} onChange={(event) => setSenderForm({ ...senderForm, app_id: event.target.value })}><option value="">全局</option>{apps.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.slug})</option>)}</select></label>
            <label>邮箱
              {selectedSenderProvider?.provider_type === 'CLOUDFLARE_EMAIL' && availableSenderDomains.length ? (
                <div className="email-address-builder">
                  <input value={emailLocalPart(senderForm.email)} onChange={(event) => setSenderForm({ ...senderForm, email: buildEmail(event.target.value, emailDomain(senderForm.email) || availableSenderDomains[0]?.name || '') })} required />
                  <span>@</span>
                  <select value={emailDomain(senderForm.email) || availableSenderDomains[0]?.name || ''} onChange={(event) => setSenderForm({ ...senderForm, email: buildEmail(emailLocalPart(senderForm.email), event.target.value) })} required>
                    {availableSenderDomains.map((item) => <option key={item.id} value={item.name}>{item.name}{item.enabled ? '' : ' (未启用)'}</option>)}
                  </select>
                </div>
              ) : (
                <input type="email" value={senderForm.email} onChange={(event) => setSenderForm({ ...senderForm, email: event.target.value })} required placeholder={loadingSenderDomains ? '正在加载域名...' : ''} />
              )}
            </label>
            <label>显示名<input value={senderForm.display_name} onChange={(event) => setSenderForm({ ...senderForm, display_name: event.target.value })} /></label>
            <label>用途<select value={senderForm.purpose} onChange={(event) => setSenderForm({ ...senderForm, purpose: event.target.value as any })}><option value="both">通用</option><option value="marketing">营销</option><option value="notification">通知</option></select></label>
            <label>状态<select value={senderForm.status} onChange={(event) => setSenderForm({ ...senderForm, status: event.target.value as 'ACTIVE' | 'INACTIVE' })}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
            <label className="inline-check"><input type="checkbox" checked={senderForm.is_default} onChange={(event) => setSenderForm({ ...senderForm, is_default: event.target.checked })} />默认发件邮箱</label>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setModalMode('')}>取消</button>
              <button className="btn btn-sm" type="submit" disabled={saving || !providers.length}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </form>
        </div>
      )}

      {modalMode === 'sender-test' && (
        <div className="modal-overlay" onMouseDown={() => setModalMode('')}>
          <form className="modal email-service-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={testSender}>
            <div className="platform-section-head"><h3>测试发件邮箱</h3></div>
            <label>发件邮箱<input value={testForm.from} disabled /></label>
            <label>收件邮箱<input type="email" value={testForm.to} onChange={(event) => setTestForm({ ...testForm, to: event.target.value })} required /></label>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setModalMode('')}>取消</button>
              <button className="btn btn-sm" type="submit" disabled={saving}>{saving ? '发送中...' : '发送测试'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function buildProviderPayload(form: typeof EMPTY_PROVIDER_FORM) {
  const base = {
    provider_type: form.provider_type,
    name: form.name || defaultProviderName(form),
    status: form.status,
    notes: form.notes,
  };
  if (form.provider_type === 'CLOUDFLARE_EMAIL') {
    return { ...base, account_id: form.account_id || undefined, api_token: form.api_token || undefined };
  }
  if (form.provider_type === 'SMTP') {
    const secrets: Record<string, string> = {};
    if (form.smtp_username) secrets.username = form.smtp_username;
    if (form.smtp_password) secrets.password = form.smtp_password;
    return {
      ...base,
      config: { host: form.smtp_host, port: Number(form.smtp_port || 465), secure: form.smtp_secure },
      ...(Object.keys(secrets).length ? { secrets } : {}),
    };
  }
  if (form.provider_type === 'POSTMARK') {
    return { ...base, ...(form.server_token ? { secrets: { server_token: form.server_token } } : {}) };
  }
  if (form.provider_type === 'MAILGUN') {
    return {
      ...base,
      config: { domain: form.mailgun_domain, api_base_url: form.mailgun_api_base_url || 'https://api.mailgun.net' },
      ...(form.api_token ? { secrets: { api_key: form.api_token } } : {}),
    };
  }
  return { ...base, ...(form.api_token ? { secrets: { api_key: form.api_token } } : {}) };
}

function defaultProviderName(form: typeof EMPTY_PROVIDER_FORM) {
  if (form.provider_type === 'SMTP') return form.smtp_host || 'SMTP';
  if (form.provider_type === 'MAILGUN') return form.mailgun_domain || 'Mailgun';
  return providerLabel(form.provider_type);
}

function providerLabel(value: PlatformEmailProviderType) {
  if (value === 'CLOUDFLARE_EMAIL') return 'Cloudflare Email';
  if (value === 'SMTP') return 'SMTP';
  if (value === 'RESEND') return 'Resend';
  if (value === 'SENDGRID') return 'SendGrid';
  if (value === 'POSTMARK') return 'Postmark';
  if (value === 'MAILGUN') return 'Mailgun';
  return value;
}

function purposeLabel(value: PlatformEmailSenderItem['purpose']) {
  if (value === 'marketing') return '营销';
  if (value === 'notification') return '通知';
  return '通用';
}

function emailLocalPart(value: string) {
  return value.includes('@') ? value.split('@')[0] : value;
}

function emailDomain(value: string) {
  return value.includes('@') ? value.split('@').slice(1).join('@') : '';
}

function buildEmail(localPart: string, domain: string) {
  const normalizedLocal = localPart.trim().replace(/@.*/, '');
  return normalizedLocal && domain ? `${normalizedLocal}@${domain}` : normalizedLocal;
}
