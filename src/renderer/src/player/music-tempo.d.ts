/**
 * `music-tempo` ships no types. It exposes a single default-ish CJS export: a
 * constructor that synchronously beat-tracks a mono PCM signal (see
 * https://github.com/killercrush/music-tempo). We only need the shape of its
 * result.
 */
declare module "music-tempo" {
  interface MusicTempoOptions {
    expiryTime?: number;
    /** Spacing between onset-detection analysis frames, in samples. */
    hopSize?: number;
    maxBeatInterval?: number;
    minBeatInterval?: number;
    /** Seconds represented by one `hopSize` hop; keep in sync with it. */
    timeStep?: number;
  }

  class MusicTempo {
    constructor(audioData: Float32Array | number[], params?: MusicTempoOptions);
    /** Beat times in seconds. */
    beats: number[];
    /** Estimated tempo in beats per minute. */
    tempo: number;
  }

  export = MusicTempo;
}
