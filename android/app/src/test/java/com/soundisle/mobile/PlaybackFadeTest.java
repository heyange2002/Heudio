package com.soundisle.mobile;

import static org.junit.Assert.*;
import android.os.Handler;
import android.os.Looper;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 35)
public class PlaybackFadeTest {
  @Test public void fadeHasIntermediateGainsAndPausesOnlyAfterReachingSilence() {
    List<Float> levels = new ArrayList<>();
    PlaybackFade[] ref = new PlaybackFade[1];
    PlaybackFade fade = new PlaybackFade(new Handler(Looper.getMainLooper()), () -> levels.add(ref[0].gain()));
    ref[0] = fade;
    boolean[] paused = {false};
    fade.to(0, () -> paused[0] = true);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(400));
    assertTrue(fade.gain() > .35f && fade.gain() < .65f);
    assertFalse(paused[0]);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(416));
    assertEquals(0, fade.gain(), .0001f); assertTrue(paused[0]);
    for (int i = 1; i < levels.size(); i++) assertTrue(levels.get(i) <= levels.get(i - 1));
    fade.to(1, null);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(400));
    assertTrue(fade.gain() > .35f && fade.gain() < .65f);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(416));
    assertEquals(1, fade.gain(), .0001f);
  }

  @Test public void resumingMidFadePreservesGainAndCancelsTheOldPause() {
    PlaybackFade fade = new PlaybackFade(new Handler(Looper.getMainLooper()), () -> {});
    boolean[] paused = {false};
    fade.to(0, () -> paused[0] = true);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(320));
    float before = fade.gain();
    fade.to(1, null);
    assertEquals(before, fade.gain(), .0001f);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(816));
    assertFalse(paused[0]); assertEquals(1, fade.gain(), .0001f);
    fade.to(0, () -> paused[0] = true);
    fade.reset(0);
    Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(816));
    assertFalse(paused[0]); assertEquals(0, fade.gain(), .0001f);
  }
}
