package com.deep.digitallife;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 数字生活 App 的外壳。
 *
 * 【它做了什么】
 * 1. 起一个全屏 WebView，把打包进 APK 里的 H5（DEEP-uniapp 的 uni-app H5 构建产物）
 *    通过一个「虚拟 https 域名」提供出来，页面里看起来就是在访问
 *    https://appassets.androidplatform.net/ ，所以：
 *      - ES Module / fetch / localStorage 这些需要「安全上下文」的能力都能用
 *      - 不会出现 file:// 下模块脚本被 CORS 拦掉的白屏问题
 * 2. 允许混合内容：页面是 https，但后端接口是 http（114.66.9.70），
 *    不放开的话请求会被 WebView 直接拦死。
 * 3. 实现了文件选择回调，不然 H5 里「换头像」点了没反应。
 *
 * 【为什么不用 DCloud 离线打包？】
 * 竞赛资源里那套 SDK 只有 arm 原生库，且 appkey 绑定在别人的 appid 上；
 * 这个壳方案不需要 appkey，任何安卓手机都能装。
 */
public class MainActivity extends Activity {

    /** 虚拟域名：页面里所有本地资源都从这个域走 */
    private static final String ASSET_HOST = "appassets.androidplatform.net";

    /**
     * 注意：这里用的是 http，不是 https。
     *
     * 一开始本鲸鱼用的是 https，模拟器（Android 11 + Chrome 83）上一切正常；
     * 但换到真机（Android 15 + 荣耀自研 WebView）后，轮播图和新闻缩略图全变成灰块——
     * 页面是 https、后端图片是 http://114.66.9.70/... ，被当成「混合内容」静默拦掉了。
     *
     * 改成 http 之后，页面和接口、图片全都是同一个协议，压根不存在混合内容问题。
     * ES Module 在 http 源下照样能用（模块只要求 MIME 正确 + 同源/CORS，不要求安全上下文），
     * localStorage、XHR、fetch 也都正常。
     */
    private static final String START_URL = "http://" + ASSET_HOST + "/index.html";

    private static final int REQ_FILE = 1001;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);

        // 状态栏染成和标题栏同一个蓝，不然顶部会有一条黑边，看着很廉价
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF1E88E5);
        }

        // 打开 WebView 调试开关：电脑上 chrome://inspect 或在 adb 里 forward 之后
        // 能直接看控制台和网络请求，排查真机问题非常有用。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage：token 就存在这里
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);           // 页面资源全部走拦截器，不需要 file 权限
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // 关键：页面是 https，后端是 http，不放行就会报 mixed content
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && ASSET_HOST.equals(uri.getHost())) {
                    return serveAsset(uri.getPath());
                }
                return null; // 其他请求（后端接口）交给系统网络栈
            }

            // Android 5.0 以下走这个重载（这里用不到，保险起见）
            @SuppressWarnings("deprecation")
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (ASSET_HOST.equals(uri.getHost())) {
                    return serveAsset(uri.getPath());
                }
                return null;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "选择图片"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    /** 把 /xxx/yyy 映射成 assets/www/xxx/yyy */
    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) {
            path = "/index.html";
        }
        String name = "www" + path;

        try {
            InputStream in = getAssets().open(name);
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mimeOf(name), "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(),
                    new ByteArrayInputStream("404".getBytes()));
        }
    }

    private String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "application/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".ttf")) return "font/ttf";
        if (n.endsWith(".woff")) return "font/woff";
        if (n.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] results = null;
                if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                    results = new Uri[] { data.getData() };
                }
                fileCallback.onReceiveValue(results);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** 按返回键先让网页后退，退到头了再退出 App */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
