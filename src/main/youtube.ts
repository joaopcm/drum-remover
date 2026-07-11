import type { YouTubeMeta } from "../shared/types";

const YOUTUBE_ID_RE = /^[\w-]{11}$/;
const WWW_PREFIX_RE = /^www\./;
const PATH_ID_SEGMENTS = new Set(["shorts", "embed", "live", "v"]);

/**
 * Extract an 11-char YouTube video id from any common URL shape (watch,
 * youtu.be, shorts, embed, live, music) or a bare id. Returns null if the
 * input isn't a recognizable YouTube reference.
 */
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (YOUTUBE_ID_RE.test(trimmed)) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const { hostname, pathname, searchParams } = url;
  const host = hostname.replace(WWW_PREFIX_RE, "");

  if (host === "youtu.be") {
    const [id] = pathname.slice(1).split("/");
    return id && YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    const v = searchParams.get("v");
    if (v && YOUTUBE_ID_RE.test(v)) {
      return v;
    }
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && PATH_ID_SEGMENTS.has(parts[0])) {
      return YOUTUBE_ID_RE.test(parts[1]) ? parts[1] : null;
    }
  }

  return null;
}

/** Canonical watch URL Socrash stores for a given video id. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** High-quality thumbnail URL for a video id (no API key required). */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Resolve display metadata for a YouTube URL using the public oEmbed endpoint.
 * Falls back to a placeholder title (but still returns a thumbnail) if oEmbed
 * is unreachable, so the preview degrades gracefully offline.
 */
export async function resolveYouTubeMeta(input: string): Promise<YouTubeMeta> {
  const videoId = parseVideoId(input);
  if (!videoId) {
    throw new Error("That doesn't look like a valid YouTube link.");
  }

  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    watchUrl(videoId)
  )}&format=json`;

  let title = "Untitled video";
  let author: string | null = null;

  try {
    const res = await fetch(oembed);
    if (res.ok) {
      const { title: resolvedTitle, author_name: resolvedAuthor } =
        (await res.json()) as {
          title?: string;
          author_name?: string;
        };
      if (resolvedTitle) {
        title = resolvedTitle;
      }
      if (resolvedAuthor) {
        author = resolvedAuthor;
      }
    }
  } catch {
    // Offline / oEmbed failure: keep placeholder title, still show thumbnail.
  }

  return { author, thumbnailUrl: thumbnailUrl(videoId), title, videoId };
}
