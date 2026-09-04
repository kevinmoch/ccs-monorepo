import { useState } from 'react';
import type { JSX } from 'react';
import { ThemeScope, useRuntimeAppearance } from '@webskill/ui-kit';
import { createExtensionRuntimeConfigStore, loadRuntimeConfigSync } from './assembly';

/**
 * 媒体设备的一次性授权页（0.17.0 分册 10 FR-10.2 / 分册 14 FR-14.7）。
 *
 * 侧栏页（`chrome-extension://…/sidepanel.html` 装在 side panel 里）没有地方锚定
 * 权限气泡，`getUserMedia` 会不弹框直接以 `not-allowed` 返回——用户看到的是一句
 * 「被拒绝」，却从没被问过。扩展页开在**普通标签页**里就能正常弹框，
 * 而授权按扩展 origin 持久化，授完这一次侧栏就能用了。
 *
 * 这一页必须**自己说清为什么要这个设备**：用户在侧栏点的是「语音输入」或「拍照」，
 * 突然跳出一个新标签页索要麦克风/摄像头，不解释等于可疑行为。
 */
export type MediaPermissionKind = 'microphone' | 'camera';

const TEXT: Record<MediaPermissionKind, Record<'zh' | 'en', Record<string, string>>> = {
  microphone: {
    zh: {
      title: '允许 WebSkill 使用麦克风',
      why: '你在侧边栏点了语音输入。侧边栏这类页面弹不出浏览器的权限框，所以这一步要在普通标签页里完成一次。',
      scope: '授权只用于把你说的话转成文字填进输入框。识别由浏览器完成，录音不会被保存，也不会发给助手以外的任何地方。',
      action: '允许麦克风',
      working: '正在请求…',
      granted: '已授权。回到侧边栏再点一次麦克风就能开始说话，这一页可以关掉了。',
      denied: '浏览器拒绝了这次请求。可以在地址栏左侧的权限图标里把麦克风改成「允许」，然后重试。',
      failed: '没能拿到麦克风。请确认设备上有可用的麦克风，然后重试。'
    },
    en: {
      title: 'Allow WebSkill to use the microphone',
      why: 'You started voice input in the side panel. Pages like the side panel cannot show the browser permission prompt, so this step has to happen once in a regular tab.',
      scope:
        'Access is used only to turn what you say into text in the composer. Recognition runs in the browser; no recording is stored or sent anywhere beyond the assistant.',
      action: 'Allow microphone',
      working: 'Requesting…',
      granted: 'Granted. Go back to the side panel, start voice input again, and you can talk. This tab can be closed.',
      denied:
        'The browser denied the request. Open the permission icon in the address bar, set the microphone to “Allow”, then try again.',
      failed: 'The microphone could not be opened. Check that the device has a working microphone, then try again.'
    }
  },
  camera: {
    zh: {
      title: '允许 WebSkill 使用摄像头',
      why: '你在侧边栏点了拍照。侧边栏这类页面弹不出浏览器的权限框，所以这一步要在普通标签页里完成一次。',
      scope: '授权只用于你按下快门的那一刻取一帧画面，作为附件放进输入框。画面不会被持续录制，也不会自动发出。',
      action: '允许摄像头',
      working: '正在请求…',
      granted: '已授权。回到侧边栏再点一次相机就能取景拍照，这一页可以关掉了。',
      denied: '浏览器拒绝了这次请求。可以在地址栏左侧的权限图标里把摄像头改成「允许」，然后重试。',
      failed: '没能打开摄像头。请确认设备上有可用的摄像头，然后重试。'
    },
    en: {
      title: 'Allow WebSkill to use the camera',
      why: 'You started photo capture in the side panel. Pages like the side panel cannot show the browser permission prompt, so this step has to happen once in a regular tab.',
      scope:
        'Access is used only to grab a single frame when you press the shutter, which is added to the composer as an attachment. Nothing is recorded continuously and nothing is sent automatically.',
      action: 'Allow camera',
      working: 'Requesting…',
      granted:
        'Granted. Go back to the side panel, open the camera again, and you can take a photo. This tab can be closed.',
      denied:
        'The browser denied the request. Open the permission icon in the address bar, set the camera to “Allow”, then try again.',
      failed: 'The camera could not be opened. Check that the device has a working camera, then try again.'
    }
  }
};

type Phase = 'idle' | 'working' | 'granted' | 'denied' | 'failed';

const store = createExtensionRuntimeConfigStore();
const FALLBACK = loadRuntimeConfigSync().appearance;

export function MediaPermissionPage({ kind }: { kind: MediaPermissionKind }): JSX.Element {
  const { appearance } = useRuntimeAppearance(store, FALLBACK);
  const t = TEXT[kind][appearance.locale];
  const [phase, setPhase] = useState<Phase>('idle');

  const request = async (): Promise<void> => {
    setPhase('working');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'microphone' ? { audio: true } : { video: true }
      );
      // 授权就是全部目的；不收流的话设备指示灯会一直亮着
      for (const track of stream.getTracks()) track.stop();
      setPhase('granted');
    } catch (e) {
      setPhase(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'failed');
    }
  };

  return (
    <ThemeScope
      theme={appearance.theme}
      className="flex h-full items-center justify-center bg-background p-6 text-foreground"
    >
      <main className="w-full max-w-md space-y-4">
        <h1 className="text-lg font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.why}</p>
        <p className="text-sm text-muted-foreground">{t.scope}</p>
        <button
          type="button"
          data-testid={`${kind}-allow`}
          disabled={phase === 'working' || phase === 'granted'}
          onClick={() => void request()}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
        >
          {phase === 'working' ? t.working : t.action}
        </button>
        {phase === 'granted' || phase === 'denied' || phase === 'failed' ? (
          <p data-testid={`${kind}-outcome`} role="status" className="text-sm">
            {t[phase]}
          </p>
        ) : null}
      </main>
    </ThemeScope>
  );
}
