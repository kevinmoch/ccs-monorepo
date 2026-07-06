package com.huawei.ccps;

import android.app.Activity;
import android.content.Intent;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Full-screen native login window for the external CCS_LOGIN_URL page.
 *
 * Launched by {@link CcsAuthPlugin#openLogin} when the app is reachable but not yet
 * authenticated. Uses a plain (non-Capacitor) WebView so its top-level navigation can be
 * observed natively via {@link WebViewClient} regardless of cross-origin restrictions —
 * this is what lets us detect the redirect to a CCS_BASE_URL + `/ierp` path once login
 * succeeds.
 */
public class CcsLoginActivity extends Activity {

    public static final String EXTRA_BASE_URL = "ccs_base_url";
    public static final String EXTRA_LOGIN_URL = "ccs_login_url";
    public static final String EXTRA_RESOLVED_URL = "ccs_resolved_url";

    private WebView webView;
    private boolean finished = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

        webView = new WebView(this);
        CcsAuthPlugin.configureWebView(webView);
        setContentView(webView);

        String baseUrl = getIntent().getStringExtra(EXTRA_BASE_URL);
        String loginUrl = getIntent().getStringExtra(EXTRA_LOGIN_URL);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (CcsAuthPlugin.isLoggedInUrl(url, baseUrl, loginUrl)) {
                    finishWithSuccess(url, baseUrl);
                }
            }
        });

        if (baseUrl != null && !baseUrl.isEmpty() && loginUrl != null && !loginUrl.isEmpty()) {
            webView.loadUrl(loginUrl);
        } else {
            setResult(Activity.RESULT_CANCELED);
            finish();
        }
    }

    private void finishWithSuccess(String url, String baseUrl) {
        if (finished) return;
        finished = true;
        Intent data = new Intent();
        data.putExtra(EXTRA_RESOLVED_URL, CcsAuthPlugin.extractResolvedBaseUrl(url, baseUrl));
        setResult(Activity.RESULT_OK, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        setResult(Activity.RESULT_CANCELED);
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
