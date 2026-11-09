package com.soundisle.mobile;

import android.Manifest;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Bundled UI and private backend share an origin; audio messages are scoped to that main-frame
 * origin.
 */
public final class MainActivity extends ComponentActivity {
  private WebView webView;
  private LinearLayout root;
  private String origin;
  private PermissionRequest microphone;
  private PlaybackService playback;
  private boolean bound = false;
  private boolean foreground = false;
  private JavaScriptReplyProxy audioReply;
  private final ArrayList<JSONObject> pendingAudio = new ArrayList<>();
  private final PlaybackService.Listener audioListener =
      state -> {
        postAudio(state.toString());
      };
  private final ServiceConnection audioConnection =
      new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
          playback = ((PlaybackService.LocalBinder) binder).service();
          for (JSONObject command : new ArrayList<>(pendingAudio)) dispatchAudio(command);
          pendingAudio.clear();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
          playback = null;
        }
      };
  private final int background = Color.rgb(19, 21, 17);

  @Override
  public void onCreate(Bundle saved) {
    super.onCreate(saved);
    root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(background);
    root.setOnApplyWindowInsetsListener(
        (view, insets) -> {
          if (Build.VERSION.SDK_INT >= 30) {
            android.graphics.Insets bars =
                insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
          } else
            view.setPadding(
                insets.getSystemWindowInsetLeft(),
                insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),
                insets.getSystemWindowInsetBottom());
          return insets;
        });
    setContentView(root);
    getOnBackPressedDispatcher()
        .addCallback(
            this,
            new OnBackPressedCallback(true) {
              @Override
              public void handleOnBackPressed() {
                handleBack();
              }
            });
    String savedOrigin = getPreferences(MODE_PRIVATE).getString("server", "");
    if (savedOrigin.isEmpty()) showConnection();
    else {
      origin = savedOrigin;
      showApp();
    }
  }

  private int dp(int size) {
    return Math.round(size * getResources().getDisplayMetrics().density);
  }

  private TextView text(String value, int size) {
    TextView view = new TextView(this);
    view.setText(value);
    view.setTextSize(size);
    view.setTextColor(Color.rgb(235, 233, 221));
    view.setPadding(0, dp(12), 0, dp(12));
    return view;
  }

  private void disposeWebView() {
    audioReply = null;
    pendingAudio.clear();
    if (playback != null) {
      playback.releaseTransientAudio();
      playback.detach(audioListener);
    }
    if (microphone != null) {
      microphone.deny();
      microphone = null;
    }
    if (webView != null) {
      webView.loadUrl("about:blank");
      webView.destroy();
      webView = null;
    }
    root.removeAllViews();
  }

  private void showConnection() {
    if (playback != null) playback.clear();
    disposeWebView();
    LinearLayout form = new LinearLayout(this);
    form.setOrientation(LinearLayout.VERTICAL);
    form.setPadding(dp(28), dp(44), dp(28), dp(24));
    root.addView(form, new LinearLayout.LayoutParams(-1, -1));
    form.addView(text("声屿 SoundIsle", 28));
    form.addView(text("连接你的声音空间", 20));
    form.addView(text("输入你的声屿手机服务地址，连接后即可进入。", 14));
    EditText address = new EditText(this);
    address.setSingleLine(true);
    address.setTextColor(Color.WHITE);
    address.setHintTextColor(Color.GRAY);
    address.setText(origin != null ? origin : BuildConfig.DEBUG ? "http://127.0.0.1:5174" : "");
    address.setHint("https://your-soundisle.example");
    address.setInputType(17);
    form.addView(address);
    TextView error = text("", 13);
    form.addView(error);
    Button connect = new Button(this);
    connect.setText("连接声屿");
    connect.setTextColor(background);
    connect.setBackgroundTintList(
        android.content.res.ColorStateList.valueOf(Color.rgb(233, 189, 123)));
    form.addView(connect);
    connect.setOnClickListener(
        v -> {
          try {
            URI uri = new URI(address.getText().toString().trim());
            String host = uri.getHost();
            boolean loopback = "127.0.0.1".equals(host) || "localhost".equals(host);
            if (host == null
                || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null
                || uri.getRawFragment() != null
                || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))
                || !("https".equals(uri.getScheme())
                    || (BuildConfig.DEBUG && loopback && "http".equals(uri.getScheme()))))
              throw new IllegalArgumentException();
            origin = uri.getScheme() + "://" + uri.getRawAuthority();
            getPreferences(MODE_PRIVATE).edit().putString("server", origin).apply();
            showApp();
          } catch (Exception e) {
            error.setText(
                BuildConfig.DEBUG
                    ? "请输入 HTTPS 地址；本机调试可用 http://127.0.0.1:5174"
                    : "请输入完整的 HTTPS 服务地址，不含路径或查询参数");
          }
        });
    if (BuildConfig.DEBUG)
      form.addView(text("本机调试：用 USB 连接手机，并在电脑执行 adb reverse tcp:5174 tcp:5174。", 12));
  }

  private boolean trusted(Uri uri) {
    return uri != null && BackendPolicy.sameOrigin(origin, uri.toString());
  }

  private void postAudio(String value) {
    if (audioReply != null
        && webView != null
        && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
      audioReply.postMessage(value);
  }

  @OptIn(markerClass = UnstableApi.class)
  private void dispatchAudio(JSONObject command) {
    if (playback == null) {
      if (pendingAudio.size() < 32) pendingAudio.add(command);
      return;
    }
    try {
      playback.attach(
          origin,
          CookieManager.getInstance().getCookie(origin + "/api"),
          foreground ? audioListener : null);
      String action = command.optString("action");
      boolean wantsStart =
          "play".equals(action)
              || "next".equals(action)
              || "previous".equals(action)
              || ("queue".equals(action) && command.optBoolean("playing"));
      boolean deferred = !foreground && !playback.isPlaybackOngoing() && wantsStart;
      if (deferred) {
        if ("queue".equals(action)) command.put("playing", false);
        else command.put("action", "state");
      }
      playback.command(command);
      if (deferred) playback.deferNotice();
    } catch (Exception e) {
      try {
        JSONObject failure = new JSONObject();
        failure.put("type", "error");
        failure.put("clientId", command.optString("clientId"));
        failure.put("revision", command.optLong("revision"));
        failure.put("error", "原生播放请求失败，请重新打开播放器");
        postAudio(failure.toString());
      } catch (Exception ignored) {
      }
    }
  }

  private Map<String, String> assetHeaders() {
    Map<String, String> headers = new HashMap<>();
    headers.put("Cache-Control", "no-cache");
    headers.put("X-Content-Type-Options", "nosniff");
    return headers;
  }

  private void showApp() {
    disposeWebView();
    webView = new WebView(this);
    webView.setBackgroundColor(background);
    root.addView(webView, new LinearLayout.LayoutParams(-1, -1));
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setAllowContentAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setUserAgentString(settings.getUserAgentString() + " SoundIsleAndroid/0.2");
    CookieManager.getInstance().setAcceptCookie(true);
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.addWebMessageListener(
          webView,
          "SoundisleAudio",
          Collections.singleton(origin),
          (view, message, source, isMainFrame, reply) -> {
            if (view != webView || !isMainFrame || !trusted(source)) return;
            if (message.getType() != WebMessageCompat.TYPE_STRING) return;
            String json = message.getData();
            if (json == null || json.length() > 2000000) return;
            try {
              JSONObject command = new JSONObject(json);
              audioReply = reply;
              dispatchAudio(command);
            } catch (Exception ignored) {
            }
          });
      if (!bound)
        bound =
            bindService(
                new Intent(this, PlaybackService.class).setAction(PlaybackService.LOCAL_BIND),
                audioConnection,
                Context.BIND_AUTO_CREATE);
    } else
      new AlertDialog.Builder(this)
          .setTitle("请更新系统 WebView")
          .setMessage("更新 Android System WebView 后可使用原生后台播放；当前使用网页播放器。")
          .setPositiveButton("知道了", null)
          .show();
    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !trusted(request.getUrl());
          }

          @Override
          public WebResourceResponse shouldInterceptRequest(
              WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!trusted(uri) || !"GET".equals(request.getMethod())) return null;
            String path = uri.getPath();
            if (path == null || path.startsWith("/api/")) return null;
            String asset =
                "/".equals(path)
                    ? "index.html"
                    : path.startsWith("/assets/") || path.startsWith("/brand/")
                        ? path.substring(1)
                        : null;
            if (asset == null || asset.contains("..") || asset.contains("\\")) return null;
            try {
              String mime =
                  asset.endsWith(".html")
                      ? "text/html"
                      : asset.endsWith(".js")
                          ? "text/javascript"
                          : asset.endsWith(".css")
                              ? "text/css"
                              : asset.endsWith(".svg")
                                  ? "image/svg+xml"
                                  : asset.endsWith(".png")
                                      ? "image/png"
                                      : asset.endsWith(".jpg")
                                          ? "image/jpeg"
                                          : "application/octet-stream";
              InputStream input = getAssets().open(asset);
              return new WebResourceResponse(mime, "UTF-8", 200, "OK", assetHeaders(), input);
            } catch (Exception e) {
              return new WebResourceResponse(
                  "text/plain",
                  "UTF-8",
                  404,
                  "Not Found",
                  Collections.emptyMap(),
                  new ByteArrayInputStream(new byte[0]));
            }
          }
        });
    webView.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public void onPermissionRequest(PermissionRequest request) {
            if (!trusted(request.getOrigin())
                || !java.util.Arrays.asList(request.getResources())
                    .contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
              request.deny();
              return;
            }
            if (microphone != null) microphone.deny();
            microphone = request;
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) grantMicrophone();
            else requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, 7);
          }

          @Override
          public void onPermissionRequestCanceled(PermissionRequest request) {
            if (microphone == request) microphone = null;
          }
        });
    webView.loadUrl(origin + "/");
  }

  private void grantMicrophone() {
    if (microphone != null) {
      microphone.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
      microphone = null;
    }
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
    super.onRequestPermissionsResult(code, permissions, grants);
    if (code == 7 && microphone != null) {
      if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) grantMicrophone();
      else {
        microphone.deny();
        microphone = null;
      }
    }
  }

  private void handleBack() {
    if (webView == null) {
      finish();
      return;
    }
    webView.evaluateJavascript(
        "Boolean(location.hash)",
        result -> {
          if ("true".equals(result)) webView.evaluateJavascript("history.back()", null);
          else
            new AlertDialog.Builder(this)
                .setTitle("声屿")
                .setItems(
                    new String[] {"继续听歌", "更换服务", "退出"},
                    (dialog, which) -> {
                      if (which == 1) showConnection();
                      else if (which == 2) {
                        if (playback != null) playback.clear();
                        finish();
                      }
                    })
                .show();
        });
  }

  @Override
  protected void onResume() {
    super.onResume();
    foreground = true;
    if (playback != null && webView != null && audioReply != null)
      playback.attach(
          origin, CookieManager.getInstance().getCookie(origin + "/api"), audioListener);
  }

  @Override
  protected void onPause() {
    super.onPause();
    foreground = false;
    if (playback != null) {
      playback.detach(audioListener);
      playback.releaseTransientAudio();
    }
    CookieManager.getInstance().flush();
  }

  @Override
  protected void onDestroy() {
    disposeWebView();
    if (bound) {
      unbindService(audioConnection);
      bound = false;
    }
    playback = null;
    super.onDestroy();
  }
}
