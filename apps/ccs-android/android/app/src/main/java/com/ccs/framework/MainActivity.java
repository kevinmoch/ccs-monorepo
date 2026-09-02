package com.huawei.ccps;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(Bundle savedInstanceState) {
		registerPlugin(CcsAuthPlugin.class);
		registerPlugin(CcsFramePlugin.class);
		super.onCreate(savedInstanceState);
		WebView webView = getBridge().getWebView();
		webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
		// Capacitor 只在 Cordova 兼容层里顺带开过这个开关；跨域 ERP 帧的取数依赖它，不能靠副作用。
		CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
	}
}
