// Sound utility for loading and playing custom sound assets
// Falls back to programmatic Web Audio API sounds if assets don't exist

// Cache for loaded audio elements
const audioCache = new Map<string, HTMLAudioElement | null>();

// Track which sounds have been checked for existence
const checkedSounds = new Set<string>();

/**
 * Sound asset paths - place your custom sound files in /public/sounds/
 * Supported formats: mp3, ogg, wav
 */
const BASE_PATH = import.meta.env.BASE_URL || '/';
export const SOUND_ASSETS = {
  cardFlip: `${BASE_PATH}sounds/card-flip.mp3`,
  cardFlick: `${BASE_PATH}sounds/card-flick.mp3`,
  cardDeal: `${BASE_PATH}sounds/card-deal.mp3`,
  timerWarning: `${BASE_PATH}sounds/timer-warning.mp3`,
  chatNotification: `${BASE_PATH}sounds/chat-notification.mp3`,
  gameStart: `${BASE_PATH}sounds/game-start.mp3`,
  victory: `${BASE_PATH}sounds/victory.mp3`,
  defeat: `${BASE_PATH}sounds/defeat.mp3`,
  trickWinClean: `${BASE_PATH}sounds/trick-win-clean.mp3`,
  trickWinPoints: `${BASE_PATH}sounds/trick-win-points.mp3`,
  trickWinQueen: `${BASE_PATH}sounds/trick-win-queen.mp3`,
  pointCounter: `${BASE_PATH}sounds/point-counter.mp3`,
} as const;

export type SoundName = keyof typeof SOUND_ASSETS;

/**
 * Check if a sound asset exists by attempting to load it
 */
async function checkSoundExists(path: string): Promise<boolean> {
  if (checkedSounds.has(path)) {
    return audioCache.has(path) && audioCache.get(path) !== null;
  }
  
  try {
    const response = await fetch(path, { method: 'HEAD' });
    const exists = response.ok;
    checkedSounds.add(path);
    
    if (exists) {
      // Preload the audio
      const audio = new Audio(path);
      audio.preload = 'auto';
      audioCache.set(path, audio);
    } else {
      audioCache.set(path, null);
    }
    
    return exists;
  } catch {
    checkedSounds.add(path);
    audioCache.set(path, null);
    return false;
  }
}

/**
 * Play a sound asset if it exists
 * Returns true if the asset was played, false if it doesn't exist (use fallback)
 */
export async function playAssetSound(soundName: SoundName, volume = 0.5): Promise<boolean> {
  const path = SOUND_ASSETS[soundName];
  
  // Check if already cached
  if (audioCache.has(path)) {
    const cachedAudio = audioCache.get(path);
    if (cachedAudio) {
      try {
        const audio = cachedAudio.cloneNode() as HTMLAudioElement;
        audio.volume = volume;
        await audio.play();
        return true;
      } catch (e) {
        console.warn(`Could not play sound ${soundName}:`, e);
        return false;
      }
    }
    return false; // Asset doesn't exist
  }
  
  // Check if asset exists
  const exists = await checkSoundExists(path);
  if (!exists) {
    return false;
  }
  
  // Play the sound
  try {
    const audio = audioCache.get(path)!.cloneNode() as HTMLAudioElement;
    audio.volume = volume;
    await audio.play();
    return true;
  } catch (e) {
    console.warn(`Could not play sound ${soundName}:`, e);
    return false;
  }
}

/**
 * Preload all sound assets (call on app init or user interaction)
 * This improves performance by checking which assets exist upfront
 */
export async function preloadSoundAssets(): Promise<void> {
  const paths = Object.values(SOUND_ASSETS);
  await Promise.all(paths.map(path => checkSoundExists(path)));
  console.log('Sound assets checked:', 
    Array.from(audioCache.entries())
      .filter(([, audio]) => audio !== null)
      .map(([path]) => path)
  );
}

/**
 * Get list of available custom sound assets
 */
export function getAvailableSounds(): SoundName[] {
  return (Object.keys(SOUND_ASSETS) as SoundName[]).filter(name => {
    const path = SOUND_ASSETS[name];
    return audioCache.has(path) && audioCache.get(path) !== null;
  });
}

/**
 * Get list of missing sound assets (using fallback programmatic sounds)
 */
export function getMissingSounds(): SoundName[] {
  return (Object.keys(SOUND_ASSETS) as SoundName[]).filter(name => {
    const path = SOUND_ASSETS[name];
    return !audioCache.has(path) || audioCache.get(path) === null;
  });
}
