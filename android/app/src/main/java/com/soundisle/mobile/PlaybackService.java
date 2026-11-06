package com.soundisle.mobile;

import android.app.PendingIntent;
import android.content.Intent;
import android.media.audiofx.Equalizer;
import android.net.Uri;
import android.os.Binder;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.ResolvingDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONArray;
import org.json.JSONObject;

@OptIn(markerClass = UnstableApi.class)
public final class PlaybackService extends MediaSessionService {
  public static final String LOCAL_BIND = "com.soundisle.mobile.BIND_PLAYBACK";

  public final class LocalBinder extends Binder {
    public PlaybackService service() {
      return PlaybackService.this;
    }
  }

  public interface Listener {
    void onState(JSONObject state);
  }

  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Set<String> failed = new HashSet<>();
  private ExoPlayer player;
  private MediaSession session;
  private Listener listener;
  private volatile String origin = "", cookie = "";
  private JSONArray queue = new JSONArray();
  private String title = "阿屿为你选的歌", mode = "sequential", error = "";
  private String clientId = "";
  private long revision = 0, queueVersion = 0, acknowledgedQueueVersion = -1;
  private float volume = .85f;
  private boolean ducked = false, muted = false;
  private long deadline = 0;
  private boolean locked = false;

  private static final class AuthExpired extends IOException {
    AuthExpired() {
      super("无法直接连接，请检查手机服务地址");
    }
  }

  private Equalizer equalizer;
  private int attemptedEqSession = C.AUDIO_SESSION_ID_UNSET;
  private boolean eqEnabled = true;
  private final float[] gains = {0, 0, 0, 0, 0};
  private final Runnable ticker =
      new Runnable() {
        @Override
        public void run() {
          if (deadline > 0) {
            long remaining = deadline - SystemClock.elapsedRealtime();
            if (remaining <= 0) {
              deadline = 0;
              player.pause();
            }
            applyVolume();
          }
          publish();
          handler.postDelayed(this, 1000);
        }
      };

  @Override
  public void onCreate() {
    super.onCreate();
    OkHttpClient http =
        new OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(
                chain -> {
                  String target = chain.request().url().toString(), base = origin;
                  if (!BackendPolicy.sameOrigin(base, target)) throw new IOException("请求来源不一致");
                  Request authenticated =
                      chain
                          .request()
                          .newBuilder()
                          .header("Cookie", cookie)
                          .header("X-Soundisle-Client", "web")
                          .build();
                  return chain.proceed(authenticated);
                })
            .build();
    ResolvingDataSource.Factory source =
        new ResolvingDataSource.Factory(
            new OkHttpDataSource.Factory(http),
            spec -> {
              String path = spec.uri.getPath();
              if (path == null || !path.startsWith("/api/music/native/"))
                throw new IOException("播放路径无效");
              String mid = BackendPolicy.mid(path.substring("/api/music/native/".length())),
                  base = origin;
              try (Response response =
                  http.newCall(
                          new Request.Builder()
                              .url(base + "/api/music/getMusicPlay/" + mid + "?quality=128")
                              .build())
                      .execute()) {
                if (response.code() == 401) throw new AuthExpired();
                if (!response.isSuccessful() || response.body() == null)
                  throw new IOException("无法获取播放链接，请检查 QQ 授权");
                String text = response.body().string();
                if (text.length() > 131072) throw new IOException("播放响应过大");
                JSONObject urls = new JSONObject(text).optJSONObject("data");
                urls = urls == null ? null : urls.optJSONObject("playUrl");
                JSONObject entry = urls == null ? null : urls.optJSONObject(mid);
                if (entry == null || entry.optString("url").isEmpty())
                  throw new IOException("这首歌暂无可用播放链接");
                return spec.withUri(Uri.parse(BackendPolicy.stream(base, entry.getString("url"))));
              } catch (IOException e) {
                throw e;
              } catch (Exception e) {
                throw new IOException("播放链接格式无效", e);
              }
            });
    player =
        new ExoPlayer.Builder(this)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(source))
            .build();
    player.setAudioAttributes(
        new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build(),
        true);
    player.setHandleAudioBecomingNoisy(true);
    player.setWakeMode(C.WAKE_MODE_LOCAL);
    player.addListener(
        new Player.Listener() {
          @Override
          public void onEvents(Player p, Player.Events events) {
            if (equalizer == null
                && player.getPlaybackState() == Player.STATE_READY
                && player.getAudioSessionId() != attemptedEqSession)
              createEqualizer(player.getAudioSessionId());
            publish();
          }

          @Override
          public void onAudioSessionIdChanged(int id) {
            createEqualizer(id);
          }

          @Override
          public void onPlayerError(PlaybackException e) {
            handlePlaybackError(e);
          }
        });
    PendingIntent activity =
        PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    session = new MediaSession.Builder(this, player).setSessionActivity(activity).build();
    // The UI uses a local binder, so no MediaController connection registers this session for us.
    addSession(session);
    applyVolume();
    handler.post(ticker);
  }

  void handlePlaybackError(PlaybackException e) {
    for (Throwable cause = e; cause != null; cause = cause.getCause()) {
      if (cause instanceof AuthExpired
          || (cause instanceof HttpDataSource.InvalidResponseCodeException
              && ((HttpDataSource.InvalidResponseCodeException) cause).responseCode == 401)) {
        player.pause();
        locked = true;
        error = "无法直接连接，请回到声屿检查手机服务地址";
        publish();
        return;
      }
    }
    if (!player.getPlayWhenReady()) {
      publish();
      return;
    }
    MediaItem item = player.getCurrentMediaItem();
    if (item != null) failed.add(item.mediaId);
    int count = player.getMediaItemCount(), index = player.getCurrentMediaItemIndex();
    for (int n = 1; n <= count; n++) {
      int next =
          player.getShuffleModeEnabled()
              ? player.getNextMediaItemIndex()
              : (index + n) % Math.max(1, count);
      if (next >= 0 && next < count && !failed.contains(player.getMediaItemAt(next).mediaId)) {
        player.seekTo(next, 0);
        player.prepare();
        player.play();
        return;
      }
      // A shuffled successor may already have failed; then use the remaining queue.
      if (player.getShuffleModeEnabled()) {
        int candidate = (index + n) % Math.max(1, count);
        if (!failed.contains(player.getMediaItemAt(candidate).mediaId)) {
          player.seekTo(candidate, 0);
          player.prepare();
          player.play();
          return;
        }
      }
    }
    player.pause();
    error = "当前歌单暂时无法播放，请检查授权或网络后重试";
    publish();
  }

  @Override
  public MediaSession onGetSession(MediaSession.ControllerInfo controller) {
    return controller.isTrusted() || getPackageName().equals(controller.getPackageName())
        ? session
        : null;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return LOCAL_BIND.equals(intent.getAction()) ? new LocalBinder() : super.onBind(intent);
  }

  public void attach(String base, String credentials, Listener next) {
    String valid = BackendPolicy.origin(base, BuildConfig.DEBUG);
    if (!origin.isEmpty() && !origin.equals(valid)) clear();
    origin = valid;
    String nextCookie = credentials == null ? "" : credentials;
    if (!cookie.equals(nextCookie)) {
      locked = false;
      error = "";
    }
    cookie = nextCookie;
    if (listener != next) acknowledgedQueueVersion = -1;
    listener = next;
    publish();
  }

  public void detach(Listener old) {
    if (listener == old) listener = null;
  }

  public void releaseTransientAudio() {
    muted = false;
    ducked = false;
    applyVolume();
  }

  public void deferNotice() {
    player.pause();
    error = "音乐已准备好，请回到应用后点击播放";
    publish();
  }

  public void clear() {
    player.pause();
    player.stop();
    player.clearMediaItems();
    queue = new JSONArray();
    queueVersion++;
    title = "阿屿为你选的歌";
    failed.clear();
    deadline = 0;
    error = "";
    locked = false;
    releaseEqualizer();
    attemptedEqSession = C.AUDIO_SESSION_ID_UNSET;
    publish();
  }

  public void command(JSONObject command) throws Exception {
    String client = command.getString("clientId");
    long nextRevision = command.getLong("revision");
    if (!client.equals(clientId)) {
      clientId = client;
      revision = 0;
      acknowledgedQueueVersion = -1;
    }
    if (nextRevision <= revision) return;
    revision = nextRevision;
    if (command.optLong("queueVersion", -1) == queueVersion)
      acknowledgedQueueVersion = queueVersion;
    String action = command.getString("action");
    if ("state".equals(action)) {
      acknowledgedQueueVersion = -1;
      publish();
      return;
    }
    if ("ack".equals(action)) {
      publish();
      return;
    }
    if ("queue".equals(action)) {
      JSONArray input = command.getJSONArray("songs");
      if (input.length() > 10000) throw new IllegalArgumentException("队列超过本机容量");
      List<MediaItem> items = new ArrayList<>();
      JSONArray clean = new JSONArray();
      Set<String> seen = new HashSet<>();
      for (int i = 0; i < input.length(); i++) {
        JSONObject song = input.getJSONObject(i);
        String mid = BackendPolicy.mid(song.getString("mid"));
        if (!seen.add(mid)) continue;
        JSONObject record = new JSONObject();
        record.put("mid", mid);
        record.put(
            "title",
            song.optString("title").substring(0, Math.min(1000, song.optString("title").length())));
        record.put("artist", song.optString("artist"));
        record.put("album", song.optString("album"));
        record.put("coverUrl", song.optString("coverUrl"));
        record.put("duration", Math.max(0, song.optDouble("duration", 0)));
        clean.put(record);
        MediaMetadata.Builder metadata =
            new MediaMetadata.Builder()
                .setTitle(record.getString("title"))
                .setArtist(record.getString("artist"))
                .setAlbumTitle(record.getString("album"));
        if (record.getString("coverUrl").startsWith("https://"))
          metadata.setArtworkUri(Uri.parse(record.getString("coverUrl")));
        items.add(
            new MediaItem.Builder()
                .setMediaId(mid)
                .setUri(origin + "/api/music/native/" + mid)
                .setMediaMetadata(metadata.build())
                .build());
      }
      String old = player.getCurrentMediaItem() == null ? "" : player.getCurrentMediaItem().mediaId;
      long position = player.getCurrentPosition();
      boolean play = player.getPlayWhenReady();
      String selected = command.optString("mid", old);
      int index = 0;
      for (int i = 0; i < items.size(); i++) if (items.get(i).mediaId.equals(selected)) index = i;
      boolean same = items.size() == player.getMediaItemCount();
      if (same)
        for (int i = 0; i < items.size(); i++)
          if (!items.get(i).mediaId.equals(player.getMediaItemAt(i).mediaId)) {
            same = false;
            break;
          }
      boolean appendOnly =
          !command.optBoolean("restart")
              && items.size() >= player.getMediaItemCount()
              && selected.equals(old);
      if (appendOnly)
        for (int i = 0; i < player.getMediaItemCount(); i++)
          if (!items.get(i).mediaId.equals(player.getMediaItemAt(i).mediaId)) {
            appendOnly = false;
            break;
          }
      queue = clean;
      queueVersion++;
      title = command.optString("title", title);
      setMode(command.optString("mode", mode));
      if (command.has("position"))
        position = Math.max(0, (long) (command.optDouble("position") * 1000));
      if (command.has("playing")) play = command.optBoolean("playing");
      if (appendOnly) {
        if (items.size() > player.getMediaItemCount())
          player.addMediaItems(items.subList(player.getMediaItemCount(), items.size()));
      } else if (!same || !selected.equals(old)) {
        player.setMediaItems(items, index, position);
        if (play) {
          failed.clear();
          error = "";
          player.prepare();
          player.play();
        }
      } else if (command.optBoolean("restart")) {
        failed.clear();
        error = "";
        player.seekTo(index, position);
        player.prepare();
        player.setPlayWhenReady(play);
      }
      publish();
      return;
    }
    if ("play".equals(action)) {
      failed.clear();
      error = "";
      String mid = command.optString("mid");
      for (int i = 0; i < player.getMediaItemCount(); i++)
        if (player.getMediaItemAt(i).mediaId.equals(mid)) {
          player.seekTo(i, Math.max(0, (long) (command.optDouble("position", 0) * 1000)));
          break;
        }
      player.prepare();
      player.play();
    } else if ("pause".equals(action)) player.pause();
    else if ("clear".equals(action)) clear();
    else if ("seek".equals(action))
      player.seekTo(Math.max(0, (long) (command.optDouble("position") * 1000)));
    else if ("next".equals(action) || "previous".equals(action)) {
      failed.clear();
      error = "";
      if (player.getMediaItemCount() > 0) {
        if ("next".equals(action)) {
          if (player.hasNextMediaItem()) player.seekToNextMediaItem();
          else player.seekTo(0, 0);
        } else if (player.hasPreviousMediaItem()) player.seekToPreviousMediaItem();
        else player.seekTo(0, 0);
        player.prepare();
        player.play();
      }
    } else if ("volume".equals(action)) {
      volume = (float) Math.max(0, Math.min(1, command.optDouble("value", .85)));
      ducked = command.optBoolean("ducked");
      muted = command.optBoolean("muted");
      applyVolume();
    } else if ("timer".equals(action)) {
      double minutes = command.optDouble("minutes");
      deadline =
          minutes > 0
              ? SystemClock.elapsedRealtime() + (long) Math.min(minutes * 60000, 86400000)
              : 0;
      applyVolume();
    } else if ("eq".equals(action)) {
      eqEnabled = command.optBoolean("enabled", true);
      JSONArray values = command.optJSONArray("gains");
      for (int i = 0; i < 5; i++)
        gains[i] = (float) Math.max(-12, Math.min(12, values == null ? 0 : values.optDouble(i, 0)));
      applyEqualizer();
    } else throw new IllegalArgumentException("未知播放操作");
    publish();
  }

  private void setMode(String value) {
    mode =
        "shuffle".equals(value)
            ? "shuffle"
            : "repeat-one".equals(value) ? "repeat-one" : "sequential";
    player.setShuffleModeEnabled("shuffle".equals(mode));
    player.setRepeatMode(
        "repeat-one".equals(mode) ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_ALL);
  }

  private void applyVolume() {
    float peak = 0;
    if (eqEnabled && equalizer != null) for (float g : gains) peak = Math.max(peak, g);
    float value = muted ? 0 : ducked ? Math.min(volume, .05f) : volume;
    float fade =
        deadline > 0
            ? Math.min(1, Math.max(0, (deadline - SystemClock.elapsedRealtime()) / 30000f))
            : 1;
    player.setVolume((float) (value * Math.pow(10, -peak / 20) * fade));
  }

  private void releaseEqualizer() {
    if (equalizer != null) {
      equalizer.release();
      equalizer = null;
    }
  }

  private void createEqualizer(int id) {
    releaseEqualizer();
    attemptedEqSession = id;
    if (id == C.AUDIO_SESSION_ID_UNSET) return;
    try {
      equalizer = new Equalizer(0, id);
      applyEqualizer();
    } catch (RuntimeException e) {
      equalizer = null;
    }
  }

  private void applyEqualizer() {
    if (equalizer != null) {
      try {
        float[] hz = {60, 250, 1000, 4000, 12000};
        short[] range = equalizer.getBandLevelRange();
        for (short i = 0; i < equalizer.getNumberOfBands(); i++) {
          float frequency = equalizer.getCenterFreq(i) / 1000f;
          int near = 0;
          for (int j = 1; j < 5; j++)
            if (Math.abs(Math.log(frequency / hz[j])) < Math.abs(Math.log(frequency / hz[near])))
              near = j;
          equalizer.setBandLevel(
              i, (short) Math.max(range[0], Math.min(range[1], Math.round(gains[near] * 100))));
        }
        equalizer.setEnabled(eqEnabled);
      } catch (RuntimeException e) {
        releaseEqualizer();
      }
    }
    applyVolume();
  }

  private void publish() {
    if (listener == null || player == null) return;
    try {
      MediaItem item = player.getCurrentMediaItem();
      JSONObject state = new JSONObject();
      state.put("clientId", clientId);
      state.put("revision", revision);
      state.put("queueVersion", queueVersion);
      // Keep sending the snapshot until JavaScript accepts it; earlier replies can be stale.
      if (acknowledgedQueueVersion != queueVersion) {
        state.put("songs", queue);
      }
      state.put("mid", item == null ? "" : item.mediaId);
      state.put("title", title);
      state.put("position", Math.max(0, player.getCurrentPosition() / 1000d));
      state.put(
          "playing",
          player.getMediaItemCount() > 0
              && player.getPlayWhenReady()
              && player.getPlaybackSuppressionReason() == Player.PLAYBACK_SUPPRESSION_REASON_NONE
              && player.getPlaybackState() != Player.STATE_ENDED);
      state.put("confirmed", player.isPlaying());
      state.put("mode", mode);
      state.put("error", error);
      state.put("locked", locked);
      state.put(
          "timerMinutes",
          deadline > 0 ? Math.ceil((deadline - SystemClock.elapsedRealtime()) / 60000d) : 0);
      state.put(
          "eqSupported",
          player.getAudioSessionId() == C.AUDIO_SESSION_ID_UNSET
              ? JSONObject.NULL
              : equalizer != null);
      listener.onState(state);
    } catch (Exception ignored) {
    }
  }

  @Override
  public void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    listener = null;
    releaseEqualizer();
    if (session != null) {
      session.release();
      session = null;
    }
    if (player != null) {
      player.release();
      player = null;
    }
    super.onDestroy();
  }
}
