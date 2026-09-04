import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { JSX } from 'react';
import { Dialog } from '@webskill/ui-kit';
import type { DataSourceCandidatesPort } from '../shared/assembly';

/**
 * 站点自荐数据源的确认入口（0.14.0 分册 21 FR-21.2）。
 *
 * **不走 `InteractionRequest`**：那条路是运行期打断对话的授权卡，
 * 而这是一次配置动作——页面每次刷新都会重发提议，接到弹卡上等于每次切 tab 都打断用户。
 *
 * 列表进弹窗、面板上只留一条定高的图标栏：站点一次自荐二十条时，
 * 内联列表会把 chatbot 压到不能用，而撤销入口又必须一直留着。
 *
 * 这里不出现 `chrome.`：候选、origin、批准与撤销都从端口进来（同 `main.tsx` 的约束）。
 */
export function DataSourceCandidates({
  port,
  locale
}: {
  port: DataSourceCandidatesPort;
  locale: 'en' | 'zh';
}): JSX.Element | null {
  const subscribe = useCallback((listener: () => void) => port.subscribe(listener), [port]);
  const version = useSyncExternalStore(subscribe, () => port.version());
  const [snapshot, setSnapshot] = useState(() => port.snapshot());
  const [remember, setRemember] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setSnapshot(port.snapshot()), [port, version]);

  const { scope, pending, approved, shadowOf } = snapshot;
  const pendingKey = pending.map((candidate) => candidate.id).join('|');
  const prompted = useRef('');
  useEffect(() => {
    // 待批的处理完就收回成图标；同一批候选被用户关掉后不再自己弹回来
    if (pendingKey === '') {
      prompted.current = '';
      setOpen(false);
      return;
    }
    if (prompted.current === pendingKey) return;
    prompted.current = pendingKey;
    setOpen(true);
  }, [pendingKey]);

  const t = locale === 'zh' ? ZH : EN;
  // AC-21.12：一条候选都没有时容器整个不存在。空区块会被读成「本站点没有数据」
  if (pending.length === 0 && approved.length === 0) return null;

  // 逐条串行：端口每次都读一遍再写回，并发会互相覆盖
  const approveAll = async (): Promise<void> => {
    for (const candidate of pending) await port.approve(candidate.id, remember);
  };
  const forgetAll = async (): Promise<void> => {
    for (const source of approved) await port.forget(source.id);
  };

  return (
    <>
      <div
        data-testid="datasource-candidates"
        className="flex h-8 shrink-0 items-center justify-end border-b border-border px-2"
      >
        <button
          type="button"
          data-testid="datasource-candidates-open"
          aria-label={t.title}
          title={t.title}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={() => setOpen(true)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
            <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
          </svg>
          <span
            data-testid="datasource-candidates-count"
            className={pending.length > 0 ? 'font-medium text-primary' : ''}
          >
            {pending.length > 0 ? t.pendingCount(pending.length) : String(approved.length)}
          </span>
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={t.title} description={scope} size="sm">
        <div data-testid="datasource-candidates-dialog" className="text-xs">
          {pending.length > 0 && (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t.pendingCount(pending.length)}</span>
                <button
                  type="button"
                  data-testid="datasource-candidates-approve-all"
                  className="rounded bg-primary px-2 py-1 text-primary-foreground"
                  onClick={() => void approveAll()}
                >
                  {t.approveAll}
                </button>
              </div>
              <ul className="space-y-2">
                {pending.map((candidate) => {
                  const shadow = shadowOf(candidate.id);
                  return (
                    <li
                      key={candidate.id}
                      data-testid="datasource-candidate"
                      className="rounded border border-border p-2"
                    >
                      <div className="font-medium text-foreground">{candidate.id}</div>
                      <div className="text-muted-foreground">{candidate.description}</div>
                      <div data-testid="datasource-candidate-untrusted" className="mt-1 text-muted-foreground">
                        {t.untrusted}
                      </div>
                      {shadow !== undefined && (
                        <div data-testid="datasource-candidate-shadowed" className="mt-1 text-destructive">
                          {shadow === 'host' ? t.shadowedByHost : t.shadowedByUser}
                        </div>
                      )}
                      <button
                        type="button"
                        data-testid="datasource-candidate-approve"
                        className="mt-2 rounded bg-primary px-2 py-1 text-primary-foreground"
                        onClick={() => void port.approve(candidate.id, remember)}
                      >
                        {t.approve}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <label className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                <input
                  type="checkbox"
                  data-testid="datasource-candidate-remember"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                {t.remember}
              </label>
            </>
          )}
          {approved.length > 0 && (
            <>
              <div className="mt-3 flex items-center justify-between gap-2">
                <h3 className="font-medium text-foreground">{t.approvedTitle}</h3>
                <button
                  type="button"
                  data-testid="datasource-approved-forget-all"
                  className="text-destructive underline"
                  onClick={() => void forgetAll()}
                >
                  {t.forgetAll}
                </button>
              </div>
              <ul className="mt-1 space-y-1">
                {approved.map((source) => (
                  <li
                    key={source.id}
                    data-testid="datasource-approved"
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-foreground">{source.id}</span>
                    <button
                      type="button"
                      data-testid="datasource-approved-forget"
                      className="text-destructive underline"
                      onClick={() => void port.forget(source.id)}
                    >
                      {t.forget}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}

const ZH = {
  title: '本站点自荐的数据源',
  untrusted: '说明由该站点提供，可能不准确',
  shadowedByHost: '未生效：同名的源由本扩展写死，不可被站点改写',
  shadowedByUser: '未生效：同名的源已由你在「设置 › 沙箱」里配置',
  approve: '允许使用',
  approveAll: '一键允许',
  remember: '记住这个站点的这个源',
  forget: '撤销',
  forgetAll: '一键撤销',
  approvedTitle: '已允许',
  pendingCount: (n: number) => `${n} 项待确认`
};

const EN = {
  title: 'Data sources declared by this site',
  untrusted: 'This description comes from the site and may be inaccurate',
  shadowedByHost: 'Not in effect: a source with this id is built into this extension',
  shadowedByUser: 'Not in effect: a source with this id is already configured in Settings › Sandbox',
  approve: 'Allow',
  approveAll: 'Allow all',
  remember: 'Remember this source for this site',
  forget: 'Revoke',
  forgetAll: 'Revoke all',
  approvedTitle: 'Allowed',
  pendingCount: (n: number) => `${n} pending`
};
