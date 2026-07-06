package com.huawei.ccps;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Handler;
import android.os.Looper;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects reachability / login status of the external CCS_BASE_URL ERP app, and hosts a
 * full-screen native login flow (against the dedicated CCS_LOGIN_URL) when the user is
 * connected but not authenticated.
 *
 * This mirrors the Electron main-process implementation (electron/main.ts): a top-level
 * navigation (native WebViewClient, not JS) is used to observe the final redirected URL,
 * which is not subject to same-origin/cross-origin JS restrictions.
 */
@CapacitorPlugin(name = "CcsAuth")
public class CcsAuthPlugin extends Plugin {

    private static final Pattern IERP_SEGMENT = Pattern.compile("/ierp(?:[/?#]|$)", Pattern.CASE_INSENSITIVE);
    private static final long CHECK_TIMEOUT_MS = 8000;

    private static String pathOf(String url) {
        try {
            return Uri.parse(url).getPath();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * A URL is "logged in" once it contains baseUrl and contains `/ierp`, as long as it isn't
     * just the login page itself (loginUrl, e.g. `.../ierp/index/login.html`, also contains
     * `/ierp` but is obviously not a successful login).
     */
    static boolean isLoggedInUrl(String url, String baseUrl, String loginUrl) {
        if (url == null || baseUrl == null || baseUrl.isEmpty() || !url.contains(baseUrl)) return false;
        if (!IERP_SEGMENT.matcher(url).find()) return false;
        if (loginUrl != null) {
            String currentPath = pathOf(url);
            String loginPath = pathOf(loginUrl);
            if (currentPath != null && currentPath.equals(loginPath)) return false;
        }
        return true;
    }

    /**
     * Extracts the tenant-qualified base URL, e.g. with baseUrl `https://ccs.huaweicloud.com`:
     * `https://ccs.huaweicloud.com/CCS_Tenant_Gray/ierp/index.html` -> `https://ccs.huaweicloud.com/CCS_Tenant_Gray`
     */
    static String extractResolvedBaseUrl(String url, String baseUrl) {
        int idx = url.indexOf(baseUrl);
        if (idx == -1) return null;
        String rest = url.substring(idx + baseUrl.length());
        Matcher matcher = Pattern.compile("^([^?#]*?)/ierp(?:[/?#]|$)", Pattern.CASE_INSENSITIVE).matcher(rest);
        if (!matcher.find()) return null;
        return baseUrl + matcher.group(1);
    }

    /**
     * Fast, near-instant offline check (no actual network I/O) used as a pre-check before the
     * slower WebView-based probe below. This app supports an offline-first usage pattern (poor
     * /no network -> let a previously-logged-in user continue with cached data), so a clearly
     * offline device should skip straight to that path rather than waiting out the WebView
     * probe's timeout. A `true` result is inconclusive (an active network interface doesn't
     * guarantee the target server is reachable), so the real probe still runs in that case.
     */
    private static boolean hasActiveNetwork(Activity activity) {
        try {
            ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            Network network = cm.getActiveNetwork();
            if (network == null) return false;
            NetworkCapabilities capabilities = cm.getNetworkCapabilities(network);
            return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return true;
        }
    }

    @PluginMethod
    public void check(PluginCall call) {
        String baseUrl = call.getString("baseUrl");
        String loginUrl = call.getString("loginUrl");
        if (baseUrl == null || baseUrl.isEmpty() || loginUrl == null || loginUrl.isEmpty()) {
            JSObject result = new JSObject();
            result.put("reachable", false);
            result.put("loggedIn", false);
            call.resolve(result);
            return;
        }

        if (!hasActiveNetwork(getActivity())) {
            JSObject result = new JSObject();
            result.put("reachable", false);
            result.put("loggedIn", false);
            call.resolve(result);
            return;
        }

        getActivity().runOnUiThread(() -> {
            Handler handler = new Handler(Looper.getMainLooper());
            WebView probe = new WebView(getActivity());
            configureWebView(probe);

            // A WebView that is never attached to the activity's window may never actually
            // load (some Android versions pause/skip rendering for detached WebViews), which
            // made this check silently hang until the timeout. Attach it as an invisible 1x1
            // view instead, and remove it once settled.
            android.view.ViewGroup root = getActivity().findViewById(android.R.id.content);
            probe.setVisibility(android.view.View.INVISIBLE);
            root.addView(probe, new android.view.ViewGroup.LayoutParams(1, 1));

            boolean[] settled = { false };
            Runnable cleanup = () -> {
                probe.stopLoading();
                root.removeView(probe);
                probe.destroy();
            };
            Runnable timeoutRunnable = () -> {
                if (settled[0]) return;
                settled[0] = true;
                cleanup.run();
                JSObject result = new JSObject();
                result.put("reachable", false);
                result.put("loggedIn", false);
                call.resolve(result);
            };
            handler.postDelayed(timeoutRunnable, CHECK_TIMEOUT_MS);

            probe.setWebViewClient(new WebViewClient() {
                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler sslHandler, SslError error) {
                    sslHandler.proceed();
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (settled[0]) return;
                    settled[0] = true;
                    handler.removeCallbacks(timeoutRunnable);
                    JSObject result = new JSObject();
                    result.put("reachable", true);
                    result.put("loggedIn", isLoggedInUrl(url, baseUrl, loginUrl));
                    result.put("resolvedUrl", url);
                    call.resolve(result);
                    cleanup.run();
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                    if (settled[0] || (request != null && !request.isForMainFrame())) return;
                    settled[0] = true;
                    handler.removeCallbacks(timeoutRunnable);
                    JSObject result = new JSObject();
                    result.put("reachable", false);
                    result.put("loggedIn", false);
                    call.resolve(result);
                    cleanup.run();
                }
            });

            // Probe CCS_LOGIN_URL rather than CCS_BASE_URL directly — confirmed more
            // reliably reachable in practice. isLoggedInUrl() still correctly excludes the
            // login page itself from being misdetected as a successful login.
            probe.loadUrl(loginUrl);
        });
    }

    @PluginMethod
    public void openLogin(PluginCall call) {
        String baseUrl = call.getString("baseUrl");
        String loginUrl = call.getString("loginUrl");
        if (baseUrl == null || baseUrl.isEmpty() || loginUrl == null || loginUrl.isEmpty()) {
            call.reject("baseUrl and loginUrl are required");
            return;
        }
        Intent intent = new Intent(getActivity(), CcsLoginActivity.class);
        intent.putExtra(CcsLoginActivity.EXTRA_BASE_URL, baseUrl);
        intent.putExtra(CcsLoginActivity.EXTRA_LOGIN_URL, loginUrl);
        startActivityForResult(call, intent, "loginResult");
    }

    @ActivityCallback
    private void loginResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            response.put("success", true);
            response.put("resolvedUrl", result.getData().getStringExtra(CcsLoginActivity.EXTRA_RESOLVED_URL));
        } else {
            response.put("success", false);
        }
        call.resolve(response);
    }

    static void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
