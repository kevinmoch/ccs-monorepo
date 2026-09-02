package com.huawei.ccps;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 外壳主帧访问帧桥的入口。
 *
 * 外壳主帧**不走 document-start 注入**——Capacitor 在 super.onCreate() 内部就 loadUrl 了，
 * 首帧必然漏掉。所以 ccsExt* 由 android-bridge.ts 在 JS 层安装，经本插件与原生通信；
 * 跨域 ERP 子帧才走注入。这也顺带避免了跨 realm 构造 Response 的问题。
 */
@CapacitorPlugin(name = "CcsFrame")
public class CcsFramePlugin extends Plugin {

    private static final String EVENT_NAME = "ccsFrameEvent";
    private static final String PREF_NAME = "ccs_frame";
    private static final String PREF_ORIGINS = "erp_origins";
    private static final String ORIGINS_ASSET = "ccs-inject/erp-origins.json";

    private CcsFrameBridge frameBridge;

    @Override
    public void load() {
        frameBridge = new CcsFrameBridge(
                getBridge().getWebView(),
                getContext(),
                (type, payload) -> {
                    JSObject event = new JSObject();
                    event.put("type", type);
                    event.put("frame", payload);
                    notifyListeners(EVENT_NAME, event);
                }
        );
        // 首帧加载前是安装注入规则的唯一安全时机，见 CcsFrameBridge.registerOrigins
        frameBridge.setShellOrigin(getBridge().getAppUrl());
        frameBridge.registerShellInjection();
        Set<String> origins = resolveOrigins();
        if (!origins.isEmpty()) frameBridge.registerOrigins(origins);
    }

    /**
     * 外壳转发层的签名 token。只在外壳 origin 下有意义：它让 android-bridge.ts
     * 能把应答送回 main-world.js。不要把它传给任何 ERP 帧。
     */
    @PluginMethod
    public void shellToken(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("authToken", frameBridge.getAuthToken());
        call.resolve(ret);
    }

    /** 读 CookieManager/WebView 必须在主线程——Capacitor 默认把 PluginMethod 派到后台线程。 */
    @PluginMethod
    public void capabilities(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                call.resolve(JSObject.fromJSONObject(frameBridge.describeCapabilities()));
            } catch (JSONException e) {
                call.reject("failed to read capabilities");
            }
        });
    }

    /**
     * 声明本次会话要注入的 ERP origin 集合（数据源是外壳的 erpOrigins()，Java 侧不写死）。
     *
     * 注入规则只能在首帧加载前装一次，所以这里**不会立即生效**：它把集合持久化下来，
     * 下次进程启动时由 load() 安装。返回 active=true 表示本次会话已经在跑这套规则；
     * active=false 且 requiresRestart=true 时，外壳需要提示用户重启应用。
     */
    @PluginMethod
    public void registerErpOrigins(PluginCall call) {
        JSArray raw = call.getArray("origins");
        if (raw == null) {
            call.reject("origins is required");
            return;
        }

        Set<String> origins = new LinkedHashSet<>();
        try {
            for (Object o : raw.toList()) {
                if (o instanceof String && !((String) o).isEmpty()) origins.add((String) o);
            }
        } catch (JSONException e) {
            call.reject("origins must be an array of strings");
            return;
        }
        if (origins.isEmpty()) {
            call.reject("origins must not be empty");
            return;
        }
        if (origins.contains("*")) {
            call.reject("wildcard origin rule is forbidden");
            return;
        }

        boolean active = frameBridge.getCurrentOrigins().containsAll(origins);
        if (!active) saveOrigins(origins);

        JSObject result = new JSObject();
        result.put("active", active);
        result.put("requiresRestart", !active);
        result.put("tier", frameBridge.getTier().name());
        call.resolve(result);
    }

    /** 构建期清单打底，外壳存下的运行时 origin 叠加上去（换租户后旧值只多活一个启动周期）。 */
    private Set<String> resolveOrigins() {
        Set<String> out = new LinkedHashSet<>(readBuiltInOrigins());
        out.addAll(readSavedOrigins());
        return out;
    }

    private Set<String> readBuiltInOrigins() {
        try {
            return parseOrigins(CcsFrameBridge.readAssetText(getContext(), ORIGINS_ASSET));
        } catch (java.io.IOException e) {
            android.util.Log.w("CcsFramePlugin", "no " + ORIGINS_ASSET + " — build step did not write it");
            return new LinkedHashSet<>();
        }
    }

    private Set<String> readSavedOrigins() {
        String json = getContext()
                .getSharedPreferences(PREF_NAME, android.content.Context.MODE_PRIVATE)
                .getString(PREF_ORIGINS, null);
        return json == null ? new LinkedHashSet<>() : parseOrigins(json);
    }

    private static Set<String> parseOrigins(String json) {
        Set<String> out = new LinkedHashSet<>();
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                String o = arr.optString(i, "");
                if (!o.isEmpty() && !"*".equals(o)) out.add(o);
            }
        } catch (JSONException ignored) {
        }
        return out;
    }

    private void saveOrigins(Set<String> origins) {
        getContext()
                .getSharedPreferences(PREF_NAME, android.content.Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_ORIGINS, new JSONArray(origins).toString())
                .apply();
    }

    @PluginMethod
    public void listFrames(PluginCall call) {
        // 先探活再快照：postMessage 必须在主线程
        getActivity().runOnUiThread(() -> {
            frameBridge.pruneDeadFrames();
            List<JSONObject> frames = frameBridge.listFrames();
            JSObject result = new JSObject();
            result.put("frames", new JSONArray(frames));
            call.resolve(result);
        });
    }

    /**
     * 跨域取数：请求在目标 ERP 帧内以该页面的身份执行，原生只做路由。
     * 响应体统一 base64（`response.bodyBase64`），由 android-bridge.ts 组装成 Response。
     */
    @PluginMethod
    public void extFetch(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        JSObject init = call.getObject("init");
        getActivity().runOnUiThread(() -> frameBridge.routeFetch(url, init, result -> {
            try {
                call.resolve(JSObject.fromJSONObject(result));
            } catch (JSONException e) {
                call.reject("malformed frame response");
            }
        }));
    }

    @PluginMethod
    public void extDom(PluginCall call) {
        String frameKey = call.getString("frameKey");
        String targetUrl = call.getString("targetUrl");
        if ((frameKey == null || frameKey.isEmpty()) && (targetUrl == null || targetUrl.isEmpty())) {
            call.reject("frameKey or targetUrl is required");
            return;
        }
        String op = call.getString("op");
        JSObject payload = call.getObject("payload");
        getActivity().runOnUiThread(() -> frameBridge.routeDom(frameKey, targetUrl, op, payload, result -> {
            try {
                call.resolve(JSObject.fromJSONObject(result));
            } catch (JSONException e) {
                call.reject("malformed frame response");
            }
        }));
    }
}
