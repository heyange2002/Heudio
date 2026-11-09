package com.soundisle.mobile;

import android.os.Handler;
import android.os.SystemClock;

/** A cancellable gain envelope, independent of user volume, EQ and voice ducking. */
final class PlaybackFade {
  static final long DURATION_MS = 800;
  private final Handler handler;
  private final Runnable changed;
  private Runnable step;
  private float gain = 1;

  PlaybackFade(Handler handler, Runnable changed) {
    this.handler = handler;
    this.changed = changed;
  }

  float gain() { return gain; }

  void cancel() {
    if (step != null) handler.removeCallbacks(step);
    step = null;
  }

  void reset(float value) {
    cancel();
    gain = value;
    changed.run();
  }

  void to(float target, Runnable completed) {
    cancel();
    final float from = gain;
    final long start = SystemClock.elapsedRealtime();
    step = new Runnable() {
      @Override public void run() {
        if (step != this) return;
        float progress = Math.min(1, (SystemClock.elapsedRealtime() - start) / (float) DURATION_MS);
        // Smoothstep avoids an abrupt change in slope at either end.
        float eased = progress * progress * (3 - 2 * progress);
        gain = from + (target - from) * eased;
        changed.run();
        if (progress < 1) handler.postDelayed(this, 16);
        else {
          step = null;
          if (completed != null) completed.run();
        }
      }
    };
    handler.post(step);
  }
}
