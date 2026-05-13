export interface Member {
  name: string;
  isHost: boolean;
  joinedAt: Date;
}

export interface RoomSettings {
  allowSkip: boolean;
  allowSeek: boolean;
}

export interface Room {
  id: string;
  hostId: string;
  hostName: string;
  settings: RoomSettings;
  members: Map<string, Member>;
  createdAt: Date;
}

export interface Track {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  source: 'youtube' | 'soundcloud';
  sourceId: string;
  displaySource?: 'spotify';
  spotifyUrl?: string;
  addedBy: string;
  addedBySocketId: string;
  addedAt: Date;
  votes: number;
  votedBy: Set<string>;
}

export interface ResolvedTrack {
  source: 'youtube' | 'soundcloud';
  displaySource?: 'spotify';
  sourceId: string;
  url: string;
  spotifyUrl?: string;
  title: string;
  artist?: string;
  thumbnail: string;
  duration: number;
}

export interface PlaybackState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  lastSyncAt: number;
}

export interface SerializedTrack {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  duration: number;
  source: 'youtube' | 'soundcloud';
  sourceId: string;
  addedBy: string;
  votes: number;
}

export interface QueueState {
  tracks: SerializedTrack[];
  currentIndex: number;
  currentTrack: SerializedTrack | null;
}
