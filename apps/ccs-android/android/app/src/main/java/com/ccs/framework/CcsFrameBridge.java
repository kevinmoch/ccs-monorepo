package com.huawei.ccps;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 跨域 ERP 子帧的原生侧帧桥，顶替 Chrome 扩展里的 service worker。
 *
 * 与 Electron 的 `electron/frame-bridge.ts` 同构：帧注册表 + 路由 + 安全闸门。
 * 差别在于 Android 没有帧树 API，注册表只能靠帧内自报，因此需要自愈
 * （`pagehide` 主动注销 + 投递失败惰性清理）。
 *
 * 线程约定：所有 WebView 操作必须在主线程；`onPostMessage` 回调本身就在主线程，
 * 插件侧入口负责切线程。注册表用并发容器，因为插件方法可能在工作线程读取。
 */
public final class CcsFrameBridge {

    private static final String TAG = "CcsFrameBridge";

    /** 注入到帧里的 JS 对象名。boot.js 会立刻夺取并从 window 上删除它。 */
    private static final String JS_OBJECT_NAME = "ccsFrameBridge";

    private static final String BOOT_ASSET = "ccs-inject/frame-boot.js";

    /** 外壳主帧的引导脚本。只带 main-world.js：外壳是发起方，不需要 DOM 探针。 */
    private static final String SHELL_BOOT_ASSET = "ccs-inject/shell-boot.js";

    private static final String[] PAYLOAD_ASSETS = {
            "ccs-inject/main-world.js",
            "ccs-inject/dom-agent.js",
    };

    private static final String[] SHELL_PAYLOAD_ASSETS = {
            "ccs-inject/main-world.js",
    };

    /** 整句形式，替换成多条语句后仍然合法，且 formatter 不会重排它。 */
    private static final String PAYLOAD_PLACEHOLDER = "var __ccsPayload = '__CCS_PAYLOAD__';";

    /** ping 发出后给帧的回答宽限，过了还没 pong 就判定帧已销毁。 */
    private static final long PING_GRACE_MS = 1000L;

    /** 帧内执行指令的等待上限。比 Electron 的 5s 宽：移动网络更慢，且这里等的是真实取数。 */
    private static final long EXEC_TIMEOUT_MS = 15000L;

    /** 一次帧内执行的回执出口。结果是原样透传的帧内报文（含 ok/response/error）。 */
    public interface ExecCallback {
        void onResult(JSONObject result);
    }

    /** WebView 能力分级，与迁移方案 6.1 的三级表一一对应。 */
    public enum Tier {
        /** 真 isolated world，token 变冗余。需 androidx.webkit 1.16+。 */
        FULL,
        /** 主世界注入 + 桥对象夺取 + token。这是设计目标。 */
        BASELINE,
        /** 注入能力不可用，不安装任何 ccsExt*，外壳走"无桥"路径。 */
        DEGRADED
    }

    /** 原生 → 外壳主帧的事件出口，由 CcsFramePlugin 实现。 */
    public interface EventSink {
        void emit(String type, JSONObject payload);
    }

    private static final class FrameEntry {
        final JavaScriptReplyProxy replyProxy;
        final String origin;
        final String frameToken;
        volatile String href;
        volatile String title;
        volatile boolean headerWrap;
        /** 最后一次收到该帧消息的时刻（elapsedRealtime）。 */
        volatile long lastSeen;
        /** 最后一次 ping 发出的时刻，0 表示未探过。 */
        volatile long pingSentAt;
        /** 最后一次自报 href/title 的时刻，多候选同分时用它取最近的那个。 */
        volatile long reportedAt;

        FrameEntry(JavaScriptReplyProxy replyProxy, String origin, String frameToken) {
            this.replyProxy = replyProxy;
            this.origin = origin;
            this.frameToken = frameToken;
        }
    }

    /** 已投出、还在等帧内回执的执行指令。frameToken 用来挡住别的帧冒答。 */
    private static final class PendingExec {
        final ExecCallback callback;
        final String frameToken;
        final Runnable timeout;

        PendingExec(ExecCallback callback, String frameToken, Runnable timeout) {
            this.callback = callback;
            this.frameToken = frameToken;
            this.timeout = timeout;
        }
    }

    private final WebView webView;
    private final Context context;
    private final EventSink events;

    /**
     * 每次进程启动重新生成。帧内脚本从注入的字面量里拿到它，页面脚本拿不到
     * （boot.js 第一时间 delete 掉桥对象，token 只活在闭包里）。
     */
    private final String authToken = UUID.randomUUID().toString();

    /** key = frm-<n>。按 replyProxy 而非 origin 去重：同一 origin 可以有多个 ERP iframe。 */
    private final Map<String, FrameEntry> registry = new ConcurrentHashMap<>();
    private final AtomicInteger seq = new AtomicInteger(0);

    private final Map<String, PendingExec> pendingExec = new ConcurrentHashMap<>();
    private final AtomicInteger execSeq = new AtomicInteger(0);
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile String shellOrigin = "";

    private boolean listenerInstalled;
    private Set<String> currentOrigins = new LinkedHashSet<>();
    private final Tier tier;

    public CcsFrameBridge(WebView webView, Context context, EventSink events) {
        this.webView = webView;
        this.context = context.getApplicationContext();
        this.events = events;
        this.tier = detectTier();
        Log.i(TAG, "tier=" + tier + " webview=" + providerLabel(this.context));
    }

    /** 外壳自身的 origin，lockdown 判定用；未设置时任何帧都不上锁。 */
    public void setShellOrigin(String url) {
        this.shellOrigin = originOf(url);
    }

    // ── 能力探测 ──────────────────────────────────────────────────────────────

    /**
     * 未知的 feature 名会让 isFeatureSupported 抛 RuntimeException 而不是返回 false
     * （androidx.webkit 1.9.0 不认识 1.16 才有的常量），所以必须吞掉异常。
     */
    private static boolean supports(String feature) {
        try {
            return WebViewFeature.isFeatureSupported(feature);
        } catch (Throwable t) {
            return false;
        }
    }

    private static Tier detectTier() {
        boolean baseline = supports(WebViewFeature.DOCUMENT_START_SCRIPT)
                && supports(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (!baseline) return Tier.DEGRADED;
        return supports("JS_INJECTION_IN_FRAME_AND_WORLD") ? Tier.FULL : Tier.BASELINE;
    }

    private static String providerLabel(Context ctx) {
        try {
            android.content.pm.PackageInfo pi = WebViewCompat.getCurrentWebViewPackage(ctx);
            return pi == null ? "unknown" : pi.packageName + " " + pi.versionName;
        } catch (Throwable t) {
            return "unknown";
        }
    }

    public Tier getTier() {
        return tier;
    }

    public JSONObject describeCapabilities() {
        JSONObject o = new JSONObject();
        try {
            o.put("tier", tier.name());
            o.put("webViewProvider", providerLabel(context));
            o.put("documentStartScript", supports(WebViewFeature.DOCUMENT_START_SCRIPT));
            o.put("webMessageListener", supports(WebViewFeature.WEB_MESSAGE_LISTENER));
            o.put("arrayBuffer", supports(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER));
            o.put("isolatedWorld", supports("JS_INJECTION_IN_FRAME_AND_WORLD"));
            o.put("thirdPartyCookies", CookieManager.getInstance().acceptThirdPartyCookies(webView));
        } catch (JSONException ignored) {
        }
        return o;
    }

    // ── origin 注册 ───────────────────────────────────────────────────────────

    /**
     * 安装注入规则。**只能在首个文档开始加载之前、在主线程调用一次。**
     *
     * P0 实测（WebView 149）：在已有活跃文档的 WebView 上调用
     * addWebMessageListener / addDocumentStartJavaScript，会先让 Capacitor 自身的
     * native→JS 回调静默失效，几秒后浏览器进程主线程 SIGSEGV。首次注册和重装规则
     * 都一样崩。所以规则集必须在 Plugin.load() 阶段就确定，运行时换租户只能重启进程。
     */
    public boolean registerOrigins(Set<String> origins) {
        if (tier == Tier.DEGRADED) {
            Log.w(TAG, "registerOrigins ignored: tier=DEGRADED");
            return false;
        }
        if (origins.isEmpty()) {
            Log.w(TAG, "registerOrigins ignored: empty origin set");
            return false;
        }
        if (listenerInstalled) {
            Log.w(TAG, "registerOrigins refused: rules are install-once; restart to change them");
            return false;
        }
        for (String o : origins) {
            if ("*".equals(o)) throw new IllegalArgumentException("wildcard origin rule is forbidden");
        }

        WebViewCompat.addWebMessageListener(webView, JS_OBJECT_NAME, origins, this::onFrameMessage);
        listenerInstalled = true;

        String boot = loadBootScript();
        if (boot == null) return false;
        // 体积是注入的直接代价，也是"构建期没拷贝注入产物"最早能被发现的地方
        Log.i(TAG, "document-start script " + boot.length() + " chars");
        WebViewCompat.addDocumentStartJavaScript(webView, boot, origins);

        currentOrigins = new LinkedHashSet<>(origins);
        Log.i(TAG, "registered for " + origins);
        return true;
    }

    public Set<String> getCurrentOrigins() {
        return new LinkedHashSet<>(currentOrigins);
    }

    /**
     * 外壳自身的鉴权 token。外壳侧转发层（android-bridge.ts）要用它给 `to:'main'`
     * 报文签名，否则 main-world.js 顶层会静默丢弃。
     *
     * 注意这等于把 token 交给外壳页面世界里的任意代码——在外壳 origin 下可以接受
     * （那里只有我们自己的包），但**绝不能**把这个方法的结果转发进 ERP 帧。
     */
    public String getAuthToken() {
        return authToken;
    }

    /**
     * 给外壳主帧装 document-start 注入，让 main-world.js 在顶层安装 window.ccsExt*。
     * 与 {@link #registerOrigins} 互不影响：外壳不走 WebMessage 桥，只有注入这一半。
     *
     * 必须在首帧加载前调用，否则 React 挂载时 `window.ccsExtDom` 还不存在，
     * 外壳的探测会误判成"扩展未安装"。
     */
    public boolean registerShellInjection() {
        if (shellOrigin.isEmpty()) {
            Log.w(TAG, "registerShellInjection skipped: shell origin unknown");
            return false;
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Log.w(TAG, "registerShellInjection skipped: DOCUMENT_START_SCRIPT unsupported");
            return false;
        }
        String boot = loadShellBootScript();
        if (boot == null) return false;
        Set<String> rules = new LinkedHashSet<>();
        rules.add(shellOrigin);
        WebViewCompat.addDocumentStartJavaScript(webView, boot, rules);
        Log.i(TAG, "shell script " + boot.length() + " chars for " + shellOrigin);
        return true;
    }

    private String loadShellBootScript() {
        try {
            String src = readAsset(SHELL_BOOT_ASSET);
            if (!src.contains(PAYLOAD_PLACEHOLDER)) {
                Log.e(TAG, "shell boot script lost its payload placeholder — ccsExt* would never install");
            }
            StringBuilder payload = new StringBuilder();
            for (String asset : SHELL_PAYLOAD_ASSETS) {
                payload.append("\n;").append(readAsset(asset)).append("\n");
            }
            return src.replace("__CCS_AUTH_TOKEN__", authToken)
                    .replace(PAYLOAD_PLACEHOLDER, payload.toString());
        } catch (IOException e) {
            Log.e(TAG, "missing " + SHELL_BOOT_ASSET + " — shell bridge will be absent", e);
            return null;
        }
    }

    private String loadBootScript() {
        try {
            String src = readAsset(BOOT_ASSET);
            if (!src.contains(PAYLOAD_PLACEHOLDER)) {
                // 占位符是整句形式，就是为了扛住 formatter；改动它会让注入静默失效
                Log.e(TAG, "boot script lost its payload placeholder — injection would be silently empty");
            }
            // token 只以字面量形式进入帧内闭包，绝不经由消息下发
            return src.replace("__CCS_AUTH_TOKEN__", authToken)
                    .replace("__CCS_BRIDGE_NAME__", JS_OBJECT_NAME)
                    .replace(PAYLOAD_PLACEHOLDER, loadPayload());
        } catch (IOException e) {
            Log.e(TAG, "missing " + BOOT_ASSET + " — build step did not copy inject assets", e);
            return null;
        }
    }

    /**
     * 取数执行器与 DOM 探针，由构建脚本从 extensions/ccs-ai-proxy/content 拷入 assets。
     * 缺失不致命：帧仍然注册得上，只是没有取数与 DOM 能力，降级比整帧失联好。
     */
    private String loadPayload() {
        StringBuilder sb = new StringBuilder();
        for (String asset : PAYLOAD_ASSETS) {
            try {
                sb.append("\n;").append(readAsset(asset)).append("\n");
            } catch (IOException e) {
                Log.w(TAG, "missing payload asset " + asset + " — frame will register without it");
            }
        }
        return sb.toString();
    }

    private String readAsset(String path) throws IOException {
        return readAssetText(context, path);
    }

    static String readAssetText(Context ctx, String path) throws IOException {
        try (InputStream is = ctx.getAssets().open(path)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            return bos.toString("UTF-8");
        }
    }

    // ── 消息入口与安全闸门 ─────────────────────────────────────────────────────

    private void onFrameMessage(@NonNull WebView view, @NonNull WebMessageCompat message,
                                @NonNull Uri sourceOrigin, boolean isMainFrame,
                                @NonNull JavaScriptReplyProxy replyProxy) {
        // 子帧通道拒收主帧消息，等价于 Electron 的 senderFrame !== mainFrame 闸门。
        // 外壳主帧有自己的入口（CcsFramePlugin），不该出现在这里。
        if (isMainFrame) return;

        String raw = message.getData();
        if (raw == null) return;

        JSONObject env;
        try {
            env = new JSONObject(raw);
        } catch (JSONException e) {
            return;
        }
        if (!authToken.equals(env.optString("authToken"))) return;

        String type = env.optString("type");
        switch (type) {
            case "frame-register":
                handleRegister(env, sourceOrigin, replyProxy);
                break;
            case "frame-update":
                handleUpdate(env);
                break;
            case "frame-unregister":
                handleUnregister(env);
                break;
            case "pong": {
                FrameEntry alive = authorized(env);
                if (alive != null) alive.lastSeen = SystemClock.elapsedRealtime();
                break;
            }
            case "exec-result":
                handleExecResult(env);
                break;
            case "open-request":
                handleOpenRequest(env);
                break;
            default:
                break;
        }
    }

    private void handleRegister(JSONObject env, Uri sourceOrigin, JavaScriptReplyProxy replyProxy) {
        String key = "frm-" + seq.incrementAndGet();
        FrameEntry entry = new FrameEntry(replyProxy, sourceOrigin.toString(), UUID.randomUUID().toString());
        entry.href = optStr(env, "href");
        entry.title = optStr(env, "title");
        entry.headerWrap = env.optBoolean("headerWrap", false);
        entry.lastSeen = SystemClock.elapsedRealtime();
        entry.reportedAt = entry.lastSeen;
        registry.put(key, entry);

        // 注入产物的解析+执行耗时，由帧内自测后随注册消息带回，用来盯住注入体积的代价
        String payloadError = optStr(env, "payloadError");
        Log.i(TAG, key + " registered " + entry.origin + " payloadCostMs=" + env.optDouble("payloadCostMs", -1)
                + (payloadError == null ? "" : " payloadError=" + payloadError));

        try {
            JSONObject ack = new JSONObject();
            ack.put("type", "frame-key");
            ack.put("authToken", authToken);
            ack.put("frameKey", key);
            ack.put("frameToken", entry.frameToken);
            // 锁定判定随应答一并下发，省一次往返：帧拿到句柄才能说话，而锁定要尽早上。
            ack.put("lockdown", shouldLockdown(env, entry.origin));
            replyProxy.postMessage(ack.toString());
        } catch (JSONException ignored) {
        }

        emitFrameEvent("frame-registered", key, entry);
    }

    private void handleUpdate(JSONObject env) {
        FrameEntry entry = authorized(env);
        if (entry == null) return;
        if (env.has("href")) entry.href = optStr(env, "href");
        if (env.has("title")) entry.title = optStr(env, "title");
        if (env.has("headerWrap")) entry.headerWrap = env.optBoolean("headerWrap", false);
        entry.reportedAt = SystemClock.elapsedRealtime();
        emitFrameEvent("frame-updated", env.optString("frameKey"), entry);
    }

    /** org.json 的 optString(key, fallback) 对 JSON null 返回字符串 "null"，只有缺键才走 fallback。 */
    private static String optStr(JSONObject o, String key) {
        return o.isNull(key) ? null : o.optString(key, null);
    }

    private void handleUnregister(JSONObject env) {
        FrameEntry entry = authorized(env);
        if (entry == null) return;
        String key = env.optString("frameKey");
        registry.remove(key);
        emitFrameEvent("frame-removed", key, entry);
    }

    /** frameToken 必须与该 frameKey 发放时的一致，否则就是 A 帧冒答 B 帧。 */
    private FrameEntry authorized(JSONObject env) {
        String key = env.optString("frameKey", null);
        if (key == null) return null;
        FrameEntry entry = registry.get(key);
        if (entry == null) return null;
        return entry.frameToken.equals(env.optString("frameToken")) ? entry : null;
    }

    // ── 路由与投递 ────────────────────────────────────────────────────────────

    /** 注册表快照，外壳的 ccsExtFrames.list() 用。 */
    public List<JSONObject> listFrames() {
        List<JSONObject> out = new ArrayList<>();
        for (Map.Entry<String, FrameEntry> e : registry.entrySet()) {
            try {
                out.add(frameJson(e.getKey(), e.getValue()));
            } catch (JSONException ignored) {
            }
        }
        return out;
    }

    /**
     * iframe 从 DOM 上摘掉时不会触发 pagehide（跨域尤其不会），而向已销毁的帧
     * postMessage 是静默 no-op、**不抛异常**（P0 实测），投递失败无法当作死亡信号。
     * 所以用 ping/pong：上一轮 ping 后没回 pong 的帧判定为已销毁。
     * 必须在主线程调用。
     */
    public void pruneDeadFrames() {
        long now = SystemClock.elapsedRealtime();
        for (Map.Entry<String, FrameEntry> e : registry.entrySet()) {
            FrameEntry entry = e.getValue();
            // 只在探过且给过足够回答时间后才判死，避免密集调用时误删活帧
            if (entry.pingSentAt > 0
                    && entry.lastSeen < entry.pingSentAt
                    && now - entry.pingSentAt >= PING_GRACE_MS) {
                FrameEntry gone = registry.remove(e.getKey());
                if (gone != null) emitFrameEvent("frame-removed", e.getKey(), gone);
                continue;
            }
            try {
                entry.replyProxy.postMessage("{\"type\":\"ping\",\"authToken\":\"" + authToken + "\"}");
                entry.pingSentAt = now;
            } catch (Throwable t) {
                FrameEntry gone = registry.remove(e.getKey());
                if (gone != null) emitFrameEvent("frame-removed", e.getKey(), gone);
            }
        }
    }

    /**
     * 向指定帧投递。失败即认为帧已消失：Android 不会在帧销毁时回调，
     * 惰性清理是注册表唯一的兜底。
     */
    public boolean post(String frameKey, JSONObject payload) {
        FrameEntry entry = registry.get(frameKey);
        if (entry == null) return false;
        try {
            payload.put("authToken", authToken);
            entry.replyProxy.postMessage(payload.toString());
            return true;
        } catch (Throwable t) {
            registry.remove(frameKey);
            emitFrameEvent("frame-removed", frameKey, entry);
            return false;
        }
    }

    /** 按 origin 选帧。多候选时保持插入顺序，由调用方依次重试。 */
    public List<String> candidatesForOrigin(String origin) {
        List<String> keys = new ArrayList<>();
        for (Map.Entry<String, FrameEntry> e : registry.entrySet()) {
            if (e.getValue().origin.equals(origin)) keys.add(e.getKey());
        }
        return keys;
    }

    // ── 帧内执行（ccsExtFetch 的原生半边） ────────────────────────────────────

    /**
     * 把一次取数投给能执行它的 ERP 帧。与 Electron `frame-bridge.ts` 的 `ccs:ext-fetch`
     * 同构：按 origin 选候选、排序、依次重试，只有帧失效（frameGone）才顺延下一个，
     * 业务错误直接回传——否则会把一次 403 变成对所有帧的重放。
     * 必须在主线程调用。
     */
    public void routeFetch(String url, JSONObject init, ExecCallback cb) {
        if (!isAllowedTarget(url)) {
            cb.onResult(error("目标地址不在允许的 ERP 站点内：" + url));
            return;
        }
        String origin = originOf(url);
        List<String> ranked = rankByUrl(candidatesForOrigin(origin), url);
        if (ranked.isEmpty()) {
            cb.onResult(error("未找到已打开的目标子网站页面（origin: " + origin + "），请先打开对应页面"));
            return;
        }
        JSONObject payload = new JSONObject();
        try {
            payload.put("url", url);
            payload.put("init", init);
        } catch (JSONException e) {
            cb.onResult(error("请求参数无法序列化"));
            return;
        }
        tryNext(ranked, 0, "fetch-exec", payload, cb);
    }

    /**
     * DOM 执行路由。带句柄就精确到帧，不做 URL 自验——句柄绑定帧本身、跨帧内导航不变，
     * 帧若中途换了页，应答里的 documentUrl 会把实际地址报回去，由外壳判漂移（与 Electron 一致）。
     */
    public void routeDom(String frameKey, String targetUrl, String op, JSONObject payload, ExecCallback cb) {
        if (!"perceive".equals(op) && !"act".equals(op)) {
            cb.onResult(error("Unsupported DOM operation: " + op));
            return;
        }

        JSONObject base = new JSONObject();
        try {
            base.put("op", op);
            base.put("payload", payload);
        } catch (JSONException e) {
            cb.onResult(error("请求参数无法序列化"));
            return;
        }

        if (frameKey != null && !frameKey.isEmpty()) {
            if (registry.get(frameKey) == null) {
                cb.onResult(error("frame-key-unknown"));
                return;
            }
            sendExec(frameKey, "dom-exec", base, cb);
            return;
        }

        if (!isAllowedTarget(targetUrl)) {
            cb.onResult(error("目标地址不在允许的 ERP 站点内：" + targetUrl));
            return;
        }
        String origin = originOf(targetUrl);
        List<String> ranked = rankByUrl(candidatesForOrigin(origin), targetUrl);
        if (ranked.isEmpty()) {
            cb.onResult(error("未找到已打开的目标子网站页面（origin: " + origin + "），请先打开对应页面"));
            return;
        }
        domTryNext(ranked, 0, base, targetUrl, new boolean[1], cb);
    }

    private void domTryNext(List<String> ranked, int i, JSONObject base, String targetUrl,
                            boolean[] sawUrlMismatch, ExecCallback cb) {
        if (i >= ranked.size()) {
            // 全员自验拒投时退回最佳猜测：不带 expectHref 重投首个候选。
            // 帧的 src 天然滞后于帧内导航，不能因自验失败就整体拒绝（与 Electron 一致）。
            if (sawUrlMismatch[0]) {
                sendExec(ranked.get(0), "dom-exec", base, cb);
            } else {
                cb.onResult(error("目标页面未返回结果，请重试"));
            }
            return;
        }

        JSONObject msg;
        try {
            msg = new JSONObject(base.toString());
            msg.put("expectHref", targetUrl);
        } catch (JSONException e) {
            cb.onResult(error("请求参数无法序列化"));
            return;
        }

        String key = ranked.get(i);
        sendExec(key, "dom-exec", msg, res -> {
            if (res.optBoolean("ok")) {
                cb.onResult(res);
                return;
            }
            if ("frame-url-mismatch".equals(optStr(res, "error"))) {
                // 帧自报的实际地址写回注册表，后续请求不用再猜
                String href = optStr(res, "href");
                FrameEntry entry = registry.get(key);
                if (href != null && entry != null) {
                    entry.href = href;
                    entry.reportedAt = SystemClock.elapsedRealtime();
                }
                sawUrlMismatch[0] = true;
                domTryNext(ranked, i + 1, base, targetUrl, sawUrlMismatch, cb);
                return;
            }
            if (res.optBoolean("frameGone")) {
                domTryNext(ranked, i + 1, base, targetUrl, sawUrlMismatch, cb);
                return;
            }
            cb.onResult(res);
        });
    }

    private void tryNext(List<String> ranked, int i, String type, JSONObject payload, ExecCallback cb) {        if (i >= ranked.size()) {
            cb.onResult(error("目标页面未返回结果，请重试"));
            return;
        }
        sendExec(ranked.get(i), type, payload, res -> {
            if (res.optBoolean("ok")) {
                cb.onResult(res);
            } else if (res.optBoolean("frameGone")) {
                tryNext(ranked, i + 1, type, payload, cb);
            } else {
                cb.onResult(res);
            }
        });
    }

    private void sendExec(String frameKey, String type, JSONObject payload, ExecCallback cb) {
        FrameEntry entry = registry.get(frameKey);
        if (entry == null) {
            cb.onResult(frameGone("目标页面已失效，请重新打开对应页面后重试"));
            return;
        }
        String reqId = "exec-" + execSeq.incrementAndGet();
        Runnable timeout = () -> {
            PendingExec p = pendingExec.remove(reqId);
            if (p != null) p.callback.onResult(frameGone("目标页面响应超时，请重试"));
        };

        JSONObject msg;
        try {
            msg = new JSONObject(payload.toString());
            msg.put("type", type);
            msg.put("reqId", reqId);
            msg.put("authToken", authToken);
        } catch (JSONException e) {
            cb.onResult(error("请求参数无法序列化"));
            return;
        }

        pendingExec.put(reqId, new PendingExec(cb, entry.frameToken, timeout));
        main.postDelayed(timeout, EXEC_TIMEOUT_MS);
        try {
            entry.replyProxy.postMessage(msg.toString());
        } catch (Throwable t) {
            // 对已销毁的帧其实是静默 no-op（P0 实测），走到这里说明是别的故障
            pendingExec.remove(reqId);
            main.removeCallbacks(timeout);
            cb.onResult(frameGone("目标页面已失效，请重新打开对应页面后重试"));
        }
    }

    /**
     * 只有"白名单外壳之下的跨域帧"才上 lockdown + 水印，同源模块帧保持自身行为（与 Electron 同构）。
     * 祖先链是帧内自报的，但判定用的 frameOrigin 来自 WebView 的 sourceOrigin，帧改不了；
     * 伪造祖先链最多让自己多上或少上一层 lockdown，越不了权。
     */
    private boolean shouldLockdown(JSONObject env, String frameOrigin) {
        JSONArray chain = env.optJSONArray("ancestors");
        if (chain == null || chain.length() == 0) return false;
        String top = originOf(chain.optString(chain.length() - 1));
        if (top.isEmpty() || !top.equals(shellOrigin)) return false;
        return !top.equals(originOf(frameOrigin));
    }

    /**
     * 帧内 lockdown 把一次开新窗口改道过来，原生只做转达：核验来源后推给外壳，立刻回执。
     * 不等外壳的处理结果——与 Electron 的 `ccs:ext-open` 一致，外壳开不开是它自己的事。
     */
    private void handleOpenRequest(JSONObject env) {
        FrameEntry entry = authorized(env);
        if (entry == null) return;
        String reqId = optStr(env, "reqId");
        if (reqId == null) return;
        String key = optStr(env, "frameKey");

        String url = optStr(env, "url");
        // 报文本身页面脚本也伪造得出来（它和 main-world 同世界），所以 scheme 必须卡死：
        // 否则 javascript: / intent: 会被原封不动转给外壳。
        boolean ok = url != null && (url.startsWith("https://") || url.startsWith("http://"));
        if (ok && events != null) {
            try {
                JSONObject payload = new JSONObject();
                payload.put("frameKey", key);
                payload.put("url", url);
                payload.put("origin", entry.origin);
                events.emit("frame-opened", payload);
            } catch (JSONException e) {
                ok = false;
            }
        }

        try {
            JSONObject res = new JSONObject();
            res.put("type", "open-result");
            res.put("authToken", authToken);
            res.put("reqId", reqId);
            res.put("ok", ok);
            entry.replyProxy.postMessage(res.toString());
        } catch (JSONException ignored) {
        }
    }

    private void handleExecResult(JSONObject env) {
        String reqId = optStr(env, "reqId");
        if (reqId == null) return;
        PendingExec pending = pendingExec.get(reqId);
        if (pending == null) return;

        // 回执必须来自当初投递的那一帧，否则是同 origin 的另一帧在冒答
        FrameEntry src = authorized(env);
        if (src == null || !pending.frameToken.equals(src.frameToken)) return;

        pendingExec.remove(reqId);
        main.removeCallbacks(pending.timeout);
        pending.callback.onResult(env);
    }

    /**
     * 候选排序，与 Electron 的 `rankByUrl` 同口径：整串命中优先，其次 pathname 命中，
     * 同分取最近自报的那一帧。取数的目标多是 API 端点、与页面地址对不上，此时全员同分，
     * 退化成"最近活跃优先"，再由 tryNext 逐个兜底。
     */
    private List<String> rankByUrl(List<String> keys, String targetUrl) {
        String targetPath = Uri.parse(targetUrl).getPath();
        List<String> out = new ArrayList<>(keys);
        Collections.sort(out, (a, b) -> {
            int byScore = scoreFrame(b, targetUrl, targetPath) - scoreFrame(a, targetUrl, targetPath);
            if (byScore != 0) return byScore;
            return Long.compare(reportedAtOf(b), reportedAtOf(a));
        });
        return out;
    }

    private long reportedAtOf(String key) {
        FrameEntry e = registry.get(key);
        return e == null ? 0L : e.reportedAt;
    }

    private int scoreFrame(String key, String targetUrl, String targetPath) {
        FrameEntry e = registry.get(key);
        if (e == null || e.href == null) return 0;
        if (e.href.equals(targetUrl)) return 2;
        if (targetPath == null) return 0;
        return targetPath.equals(Uri.parse(e.href).getPath()) ? 1 : 0;
    }

    private static JSONObject error(String message) {
        return envelope(false, message, false);
    }

    /** frameGone 是"可以换一帧重试"的信号，与业务错误必须分开——外壳的重试逻辑键于它。 */
    private static JSONObject frameGone(String message) {
        return envelope(false, message, true);
    }

    private static JSONObject envelope(boolean ok, String message, boolean gone) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", ok);
            o.put("error", message);
            if (gone) o.put("frameGone", true);
        } catch (JSONException ignored) {
        }
        return o;
    }

    private static String originOf(String url) {
        Uri u = Uri.parse(url);
        return u.getScheme() + "://" + u.getAuthority();
    }

    /** ccsExtFetch 的 SSRF 闸门：目标必须落在已注册的 ERP origin 集合内。 */
    public boolean isAllowedTarget(String url) {
        try {
            return currentOrigins.contains(originOf(url));
        } catch (Throwable t) {
            return false;
        }
    }

    private JSONObject frameJson(String key, FrameEntry entry) throws JSONException {
        JSONObject o = new JSONObject();
        o.put("frameKey", key);
        o.put("origin", entry.origin);
        o.put("href", entry.href);
        o.put("title", entry.title);
        o.put("headerWrap", entry.headerWrap);
        return o;
    }

    private void emitFrameEvent(String type, String key, FrameEntry entry) {
        if (events == null) return;
        try {
            events.emit(type, frameJson(key, entry));
        } catch (JSONException ignored) {
        }
    }
}
