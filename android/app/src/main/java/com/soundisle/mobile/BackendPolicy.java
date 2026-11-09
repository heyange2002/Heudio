package com.soundisle.mobile;

import java.net.URI;

/** Shared URL checks for API, streaming and the origin-scoped WebView channel. */
public final class BackendPolicy {
  private BackendPolicy() {}

  public static String origin(String value, boolean debug) {
    URI uri = URI.create(value);
    String host = uri.getHost();
    boolean local = "127.0.0.1".equals(host) || "localhost".equals(host);
    if (host == null
        || uri.getRawUserInfo() != null
        || uri.getRawQuery() != null
        || uri.getRawFragment() != null
        || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))
        || !("https".equals(uri.getScheme()) || (debug && local && "http".equals(uri.getScheme()))))
      throw new IllegalArgumentException("Invalid backend origin");
    return uri.getScheme() + "://" + uri.getRawAuthority();
  }

  private static int port(URI uri) {
    return uri.getPort() >= 0 ? uri.getPort() : "https".equals(uri.getScheme()) ? 443 : 80;
  }

  public static boolean sameOrigin(String base, String value) {
    try {
      URI a = URI.create(base), b = URI.create(value);
      return a.getHost() != null
          && a.getHost().equalsIgnoreCase(b.getHost())
          && a.getScheme().equals(b.getScheme())
          && port(a) == port(b)
          && b.getRawUserInfo() == null;
    } catch (Exception e) {
      return false;
    }
  }

  public static String stream(String base, String candidate) {
    URI url = URI.create(base + "/").resolve(candidate);
    if (!sameOrigin(base, url.toString())
        || url.getRawQuery() != null
        || url.getRawFragment() != null
        || !url.getRawPath().matches("/api/music/stream/[a-f0-9]{48}"))
      throw new IllegalArgumentException("Invalid stream URL");
    return url.toString();
  }

  public static String mid(String value) {
    if (value == null || !value.matches("[A-Za-z0-9]{1,128}"))
      throw new IllegalArgumentException("Invalid music ID");
    return value;
  }
}
