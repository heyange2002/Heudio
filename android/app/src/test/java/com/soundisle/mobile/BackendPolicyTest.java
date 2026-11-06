package com.soundisle.mobile;

import static org.junit.Assert.*;

import org.junit.Test;

public class BackendPolicyTest {
  @Test
  public void onlyHttpsOrDebugLoopbackOriginsAreAllowed() {
    assertEquals(
        "https://soundisle.example", BackendPolicy.origin("https://soundisle.example/", false));
    assertEquals("http://127.0.0.1:5174", BackendPolicy.origin("http://127.0.0.1:5174", true));
    for (String invalid :
        new String[] {
          "http://127.0.0.1:5174",
          "http://example.com",
          "https://user:pass@example.com",
          "https://example.com/path",
          "https://example.com/#x",
          "https://example.com/?x=1"
        }) assertThrows(IllegalArgumentException.class, () -> BackendPolicy.origin(invalid, false));
  }

  @Test
  public void mediaTicketsStayOnTheConfiguredOriginAndNeverContainCredentialsOrParameters() {
    String path = "/api/music/stream/" + "a".repeat(48);
    assertEquals("https://example.com" + path, BackendPolicy.stream("https://example.com", path));
    assertTrue(BackendPolicy.sameOrigin("https://example.com:443", "https://example.com/"));
    for (String invalid :
        new String[] {
          "https://evil.example" + path,
          "https://user:pass@example.com" + path,
          path + "?token=leak",
          path + "#fragment",
          "/api/music/stream/%2f" + "a".repeat(46),
          "https://example.com:8443" + path
        })
      assertThrows(
          IllegalArgumentException.class,
          () -> BackendPolicy.stream("https://example.com", invalid));
    assertThrows(IllegalArgumentException.class, () -> BackendPolicy.mid("../settings"));
  }
}
