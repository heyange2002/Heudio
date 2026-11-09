package com.soundisle.mobile;

import static org.junit.Assert.*;

import android.os.Looper;
import androidx.media3.common.C;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ServiceController;
import org.robolectric.annotation.Config;
import org.robolectric.util.ReflectionHelpers;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class PlaybackServiceTest {
  private ServiceController<PlaybackService> lifecycle;
  private PlaybackService service;
  private ExoPlayer player;
  private long revision = 0;
  private final List<JSONObject> states = new ArrayList<>();
  private final PlaybackService.Listener listener = state -> states.add(state);

  @Before
  public void setup() {
    lifecycle = Robolectric.buildService(PlaybackService.class).create();
    service = lifecycle.get();
    player = ReflectionHelpers.getField(service, "player");
    service.attach("https://soundisle.example", "private-cookie", listener);
  }

  @After
  public void teardown() {
    lifecycle.destroy();
  }

  private void command(String action, JSONObject body) throws Exception {
    body.put("action", action).put("clientId", "test-client").put("revision", ++revision);
    service.command(body);
    Shadows.shadowOf(Looper.getMainLooper()).idle();
  }

  private JSONArray songs(String... mids) throws Exception {
    JSONArray values = new JSONArray();
    for (String mid : mids)
      values.put(
          new JSONObject()
              .put("mid", mid)
              .put("title", "Song " + mid)
              .put("artist", "Artist")
              .put("duration", 180));
    return values;
  }

  @Test
  public void queueAndSystemPlayerControlsSurviveDetachingThePage() throws Exception {
    assertEquals(1, service.getSessions().size());
    assertNotSame(player, service.getSessions().get(0).getPlayer());
    command(
        "queue",
        new JSONObject()
            .put("songs", songs("one", "two"))
            .put("mid", "one")
            .put("title", "Evening")
            .put("mode", "sequential")
            .put("position", 12));
    assertEquals(2, player.getMediaItemCount());
    assertEquals("Song one", player.getMediaMetadata().title.toString());
    assertEquals(12000, player.getCurrentPosition());
    assertEquals(C.USAGE_MEDIA, player.getAudioAttributes().usage);
    service.detach(listener);
    int updates = states.size();
    service.getSessions().get(0).getPlayer().seekToNextMediaItem();
    Shadows.shadowOf(Looper.getMainLooper()).idle();
    assertEquals("two", player.getCurrentMediaItem().mediaId);
    assertEquals(updates, states.size());
    service.attach("https://soundisle.example", "private-cookie", listener);
    command("state", new JSONObject());
    JSONObject current = states.get(states.size() - 1);
    assertEquals("two", current.getString("mid"));
    assertEquals(2, current.getJSONArray("songs").length());
    assertFalse(current.toString().contains("private-cookie"));
  }

  @Test
  public void snapshotsRepeatUntilTheCurrentPageAcknowledgesReceivingThem() throws Exception {
    command("state", new JSONObject());
    assertTrue(states.get(states.size() - 1).has("songs"));
    command("volume", new JSONObject().put("value", .5));
    JSONObject snapshot = states.get(states.size() - 1);
    assertTrue(snapshot.has("songs"));
    command("ack", new JSONObject().put("queueVersion", snapshot.getLong("queueVersion")));
    assertFalse(states.get(states.size() - 1).has("songs"));
    command("queue", new JSONObject().put("songs", songs("one")).put("mid", "one"));
    assertTrue(states.get(states.size() - 1).has("songs"));
    command("volume", new JSONObject().put("value", .8));
    assertTrue(states.get(states.size() - 1).has("songs"));
  }

  @Test
  public void appendAndModeChangesKeepPositionAndStaleCommandsCannotReplaceTheQueue()
      throws Exception {
    command(
        "queue",
        new JSONObject()
            .put("songs", songs("one"))
            .put("mid", "one")
            .put("position", 42)
            .put("mode", "sequential"));
    command(
        "queue",
        new JSONObject()
            .put("songs", songs("one", "two"))
            .put("mid", "one")
            .put("mode", "shuffle"));
    assertEquals(42000, player.getCurrentPosition());
    assertTrue(player.getShuffleModeEnabled());
    assertEquals(Player.REPEAT_MODE_ALL, player.getRepeatMode());
    service.command(
        new JSONObject().put("action", "clear").put("clientId", "test-client").put("revision", 1));
    assertEquals(2, player.getMediaItemCount());
    player.setPlayWhenReady(true);
    command("clear", new JSONObject());
    assertEquals(0, player.getMediaItemCount());
    assertFalse(player.getPlayWhenReady());
  }

  @Test
  public void nativeSleepTimerExpiresWithoutAnyPageListener() throws Exception {
    command(
        "queue", new JSONObject().put("songs", songs("one")).put("mid", "one").put("position", 0));
    player.setPlayWhenReady(true);
    command("timer", new JSONObject().put("minutes", .01));
    service.detach(listener);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
    assertFalse(player.getPlayWhenReady());
    service.attach("https://soundisle.example", "private-cookie", listener);
    command("state", new JSONObject());
    assertEquals(0, states.get(states.size() - 1).getInt("timerMinutes"));
  }

  @Test
  public void aLateNetworkFailureCannotResumeMusicAfterTheUserPaused() throws Exception {
    command(
        "queue",
        new JSONObject().put("songs", songs("one", "two")).put("mid", "one").put("position", 0));
    command("pause", new JSONObject());
    service.handlePlaybackError(
        new PlaybackException(
            "network",
            new java.io.IOException("offline"),
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED));
    assertEquals("one", player.getCurrentMediaItem().mediaId);
    assertFalse(player.getPlayWhenReady());
  }

  @Test
  public void transientVoiceMutingIsReleasedWhenThePageGoesAway() throws Exception {
    command("eq", new JSONObject().put("enabled", true).put("gains", new JSONArray("[6,3,0,0,0]")));
    assertTrue(player.getVolume() < .85f);
    command(
        "eq", new JSONObject().put("enabled", false).put("gains", new JSONArray("[6,3,0,0,0]")));
    assertEquals(.85f, player.getVolume(), .0001f);
    command("volume", new JSONObject().put("value", .8).put("ducked", true).put("muted", false));
    assertEquals(.05f, player.getVolume(), .0001f);
    command("volume", new JSONObject().put("value", .8).put("ducked", true).put("muted", true));
    assertEquals(0f, player.getVolume(), .0001f);
    service.releaseTransientAudio();
    assertEquals(.8f, player.getVolume(), .0001f);
  }

  @Test
  public void systemControlsAndPageCommandsArmTheSameFadeAndCancelPendingStarts() throws Exception {
    command("queue", new JSONObject().put("songs", songs("one")).put("mid", "one"));
    Player controls = service.getSessions().get(0).getPlayer();
    controls.play();
    assertTrue(player.getPlayWhenReady());
    assertEquals(0, player.getVolume(), .0001f);
    command("pause", new JSONObject());
    assertFalse(player.getPlayWhenReady());
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
    assertFalse(player.getPlayWhenReady());
    controls.setPlayWhenReady(true);
    assertTrue(player.getPlayWhenReady());
    assertEquals(0, player.getVolume(), .0001f);
    controls.pause();
    assertFalse(player.getPlayWhenReady());
  }

  @Test
  public void resumeKeepsTheNativePositionInsteadOfSeekingToAStalePageSnapshot() throws Exception {
    command("queue", new JSONObject().put("songs", songs("one")).put("mid", "one").put("position", 42));
    command("play", new JSONObject().put("mid", "one").put("position", 40).put("resume", true));
    assertEquals(42000, player.getCurrentPosition());
    command("pause", new JSONObject());
    command("play", new JSONObject().put("mid", "one").put("position", 5).put("resume", false));
    assertEquals(5000, player.getCurrentPosition());
  }
}
