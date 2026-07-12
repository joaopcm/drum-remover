import { SONG_FILES, songAssetUrl } from "@shared/asset";
import type { PeaksData } from "@shared/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FIXTURE_ASSETS } from "./fixtures";
import { buildClickTrack, detectBeats, toMonoFromBuffer } from "./metronome";
import { clampTime, currentPosition } from "./time";

/** Lifecycle of the currently loaded song. */
export type PlayerStatus = "idle" | "loading" | "ready" | "error";

interface DecodedSong {
  drumBuffer: AudioBuffer;
  metronomeBuffer: AudioBuffer;
  peaks: PeaksData;
  restBuffer: AudioBuffer;
}

export interface PlayerState {
  currentSongId: string | null;
  drumVolume: number;
  durationSec: number;
  metronomeVolume: number;
  peaks: PeaksData | null;
  playing: boolean;
  positionSec: number;
  restVolume: number;
  status: PlayerStatus;
}

export interface PlayerControls {
  load: (songId: string) => Promise<boolean>;
  pause: () => void;
  play: () => void;
  seek: (sec: number) => void;
  setDrumVolume: (value: number) => void;
  setMetronomeVolume: (value: number) => void;
  setRestVolume: (value: number) => void;
  toggle: () => void;
}

export type PlayerContextValue = PlayerState & PlayerControls;

const PlayerContext = createContext<PlayerContextValue | null>(null);

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return await response.arrayBuffer();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Synthesize the metronome track from the drums stem's beat times. Beat
 * detection never throws (see `detectBeats`), so a song whose tempo can't be
 * tracked simply gets a silent click track rather than failing to load.
 */
async function buildMetronomeTrack(
  ctx: AudioContext,
  drumBuffer: AudioBuffer,
  restBuffer: AudioBuffer
): Promise<AudioBuffer> {
  const durationSec = Math.max(drumBuffer.duration, restBuffer.duration);
  const beats = await detectBeats(
    toMonoFromBuffer(drumBuffer),
    drumBuffer.sampleRate
  );
  return buildClickTrack(ctx, beats, durationSec);
}

async function decodeFromUrls(
  ctx: AudioContext,
  drumsUrl: string,
  restUrl: string,
  peaksUrl: string
): Promise<DecodedSong> {
  const [drumsData, restData, peaks] = await Promise.all([
    fetchArrayBuffer(drumsUrl),
    fetchArrayBuffer(restUrl),
    fetchJson<PeaksData>(peaksUrl),
  ]);
  const [drumBuffer, restBuffer] = await Promise.all([
    ctx.decodeAudioData(drumsData),
    ctx.decodeAudioData(restData),
  ]);
  const metronomeBuffer = await buildMetronomeTrack(
    ctx,
    drumBuffer,
    restBuffer
  );
  return { drumBuffer, metronomeBuffer, peaks, restBuffer };
}

/**
 * Load a song's stems, preferring the real files served over `app://` and
 * falling back to the committed fixtures when they don't exist yet (issue #4
 * has not landed, so every song currently resolves to the fixtures).
 */
async function loadSong(
  ctx: AudioContext,
  songId: string
): Promise<DecodedSong> {
  try {
    return await decodeFromUrls(
      ctx,
      songAssetUrl(songId, SONG_FILES.drums),
      songAssetUrl(songId, SONG_FILES.rest),
      songAssetUrl(songId, SONG_FILES.peaks)
    );
  } catch {
    return await decodeFromUrls(
      ctx,
      FIXTURE_ASSETS.drumsUrl,
      FIXTURE_ASSETS.restUrl,
      FIXTURE_ASSETS.peaksUrl
    );
  }
}

export function PlayerProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [drumVolume, setDrumVolumeState] = useState(1);
  const [restVolume, setRestVolumeState] = useState(1);
  // Off by default: existing songs get a metronome without changing how
  // anything already in the library sounds until the user opts in.
  const [metronomeVolume, setMetronomeVolumeState] = useState(0);
  const [peaks, setPeaks] = useState<PeaksData | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const drumGainRef = useRef<GainNode | null>(null);
  const restGainRef = useRef<GainNode | null>(null);
  const metronomeGainRef = useRef<GainNode | null>(null);
  const drumBufferRef = useRef<AudioBuffer | null>(null);
  const restBufferRef = useRef<AudioBuffer | null>(null);
  const metronomeBufferRef = useRef<AudioBuffer | null>(null);
  const drumSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const restSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const metronomeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const pausedPositionRef = useRef(0);
  const durationRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const loadTokenRef = useRef(0);

  const ensureContext = useCallback((): AudioContext => {
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      const drumGain = ctx.createGain();
      const restGain = ctx.createGain();
      const metronomeGain = ctx.createGain();
      drumGain.gain.value = drumVolume;
      restGain.gain.value = restVolume;
      metronomeGain.gain.value = metronomeVolume;
      drumGain.connect(ctx.destination);
      restGain.connect(ctx.destination);
      metronomeGain.connect(ctx.destination);
      ctxRef.current = ctx;
      drumGainRef.current = drumGain;
      restGainRef.current = restGain;
      metronomeGainRef.current = metronomeGain;
    }
    return ctx;
  }, [drumVolume, restVolume, metronomeVolume]);

  const stopSources = useCallback(() => {
    for (const source of [
      drumSourceRef.current,
      restSourceRef.current,
      metronomeSourceRef.current,
    ]) {
      if (source) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // Source may have already stopped; disconnecting below is enough.
        }
        source.disconnect();
      }
    }
    drumSourceRef.current = null;
    restSourceRef.current = null;
    metronomeSourceRef.current = null;
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const finishPlayback = useCallback(() => {
    stopSources();
    stopRaf();
    playingRef.current = false;
    setPlaying(false);
    pausedPositionRef.current = durationRef.current;
    setPositionSec(durationRef.current);
  }, [stopRaf, stopSources]);

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) {
      return;
    }
    const pos = currentPosition({
      durationSec: durationRef.current,
      nowCtxTime: ctx.currentTime,
      startCtxTime: startCtxTimeRef.current,
      startOffsetSec: startOffsetRef.current,
    });
    setPositionSec(pos);
    if (pos >= durationRef.current) {
      finishPlayback();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [finishPlayback]);

  const startRaf = useCallback(() => {
    stopRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf, tick]);

  const startPlayback = useCallback(
    (offsetSec: number) => {
      const ctx = ensureContext();
      const drumBuffer = drumBufferRef.current;
      const restBuffer = restBufferRef.current;
      const metronomeBuffer = metronomeBufferRef.current;
      if (
        !(
          drumBuffer &&
          restBuffer &&
          metronomeBuffer &&
          drumGainRef.current &&
          restGainRef.current &&
          metronomeGainRef.current
        )
      ) {
        return;
      }
      stopSources();

      const drumSource = ctx.createBufferSource();
      drumSource.buffer = drumBuffer;
      drumSource.connect(drumGainRef.current);
      const restSource = ctx.createBufferSource();
      restSource.buffer = restBuffer;
      restSource.connect(restGainRef.current);
      const metronomeSource = ctx.createBufferSource();
      metronomeSource.buffer = metronomeBuffer;
      metronomeSource.connect(metronomeGainRef.current);

      // Same clock reading for all three keeps them phase-locked forever.
      const when = ctx.currentTime;
      drumSource.start(when, offsetSec);
      restSource.start(when, offsetSec);
      metronomeSource.start(when, offsetSec);

      drumSourceRef.current = drumSource;
      restSourceRef.current = restSource;
      metronomeSourceRef.current = metronomeSource;
      startCtxTimeRef.current = when;
      startOffsetRef.current = offsetSec;
    },
    [ensureContext, stopSources]
  );

  const play = useCallback(() => {
    if (
      !(
        drumBufferRef.current &&
        restBufferRef.current &&
        metronomeBufferRef.current
      )
    ) {
      return;
    }
    const ctx = ensureContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        // Resuming can reject if the context is closing; playback simply
        // won't start and the UI stays paused.
      });
    }
    const from =
      pausedPositionRef.current >= durationRef.current
        ? 0
        : pausedPositionRef.current;
    startPlayback(from);
    playingRef.current = true;
    setPlaying(true);
    startRaf();
  }, [ensureContext, startPlayback, startRaf]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (!(ctx && playingRef.current)) {
      return;
    }
    const pos = currentPosition({
      durationSec: durationRef.current,
      nowCtxTime: ctx.currentTime,
      startCtxTime: startCtxTimeRef.current,
      startOffsetSec: startOffsetRef.current,
    });
    stopSources();
    stopRaf();
    pausedPositionRef.current = pos;
    setPositionSec(pos);
    playingRef.current = false;
    setPlaying(false);
  }, [stopRaf, stopSources]);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      pause();
    } else {
      play();
    }
  }, [pause, play]);

  const seek = useCallback(
    (sec: number) => {
      const clamped = clampTime(sec, durationRef.current);
      pausedPositionRef.current = clamped;
      setPositionSec(clamped);
      if (playingRef.current) {
        startPlayback(clamped);
      }
    },
    [startPlayback]
  );

  const setDrumVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setDrumVolumeState(clamped);
    if (drumGainRef.current) {
      drumGainRef.current.gain.value = clamped;
    }
  }, []);

  const setRestVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setRestVolumeState(clamped);
    if (restGainRef.current) {
      restGainRef.current.gain.value = clamped;
    }
  }, []);

  const setMetronomeVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    setMetronomeVolumeState(clamped);
    if (metronomeGainRef.current) {
      metronomeGainRef.current.gain.value = clamped;
    }
  }, []);

  const load = useCallback(
    async (songId: string): Promise<boolean> => {
      const ctx = ensureContext();
      const token = loadTokenRef.current + 1;
      loadTokenRef.current = token;

      stopSources();
      stopRaf();
      playingRef.current = false;
      setPlaying(false);
      setCurrentSongId(songId);
      setStatus("loading");

      try {
        const decoded = await loadSong(ctx, songId);
        if (token !== loadTokenRef.current) {
          return false;
        }
        drumBufferRef.current = decoded.drumBuffer;
        restBufferRef.current = decoded.restBuffer;
        metronomeBufferRef.current = decoded.metronomeBuffer;
        const duration = Math.max(
          decoded.drumBuffer.duration,
          decoded.restBuffer.duration
        );
        durationRef.current = duration;
        pausedPositionRef.current = 0;
        setDurationSec(duration);
        setPositionSec(0);
        setPeaks(decoded.peaks);
        setStatus("ready");
        return true;
      } catch {
        if (token === loadTokenRef.current) {
          setStatus("error");
        }
        return false;
      }
    },
    [ensureContext, stopRaf, stopSources]
  );

  useEffect(
    () => () => {
      stopRaf();
      stopSources();
      ctxRef.current?.close().catch(() => {
        // Nothing to recover if the context is already gone.
      });
    },
    [stopRaf, stopSources]
  );

  const contextValue = useMemo<PlayerContextValue>(
    () => ({
      currentSongId,
      drumVolume,
      durationSec,
      load,
      metronomeVolume,
      pause,
      peaks,
      play,
      playing,
      positionSec,
      restVolume,
      seek,
      setDrumVolume,
      setMetronomeVolume,
      setRestVolume,
      status,
      toggle,
    }),
    [
      currentSongId,
      drumVolume,
      durationSec,
      load,
      metronomeVolume,
      pause,
      peaks,
      play,
      playing,
      positionSec,
      restVolume,
      seek,
      setDrumVolume,
      setMetronomeVolume,
      setRestVolume,
      status,
      toggle,
    ]
  );

  return (
    <PlayerContext.Provider value={contextValue}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (context === null) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
