import { v4 as uuidv4 } from 'uuid';
import { Track, SerializedTrack, QueueState } from '../types';

interface QueueEntry {
  queue: Track[];
  currentIndex: number;
}

const queues = new Map<string, QueueEntry>();

// nextTrack() from the original queueManager is omitted — all advancement uses removeCurrentAndGetNext

export function initQueue(roomCode: string): void {
  if (!queues.has(roomCode)) {
    queues.set(roomCode, { queue: [], currentIndex: -1 });
  }
}

export function addToQueue(roomCode: string, track: Partial<Track>): Track {
  initQueue(roomCode);
  const q = queues.get(roomCode)!;

  const queueItem: Track = {
    id: uuidv4(),
    url: track.url ?? '',
    title: track.title || 'Unknown Track',
    thumbnail: track.thumbnail ?? '',
    duration: track.duration ?? 0,
    source: track.source ?? 'youtube',
    addedBy: track.addedBy ?? 'Unknown',
    addedBySocketId: track.addedBySocketId ?? '',
    sourceId: track.sourceId ?? '',
    displaySource: track.displaySource,
    spotifyUrl: track.spotifyUrl,
    addedAt: new Date(),
    votes: 0,
    votedBy: new Set(),
  };

  q.queue.push(queueItem);

  if (q.queue.length === 1 && q.currentIndex === -1) {
    q.currentIndex = 0;
  }

  return queueItem;
}

export function removeFromQueue(roomCode: string, trackId: string): Track | null {
  const q = queues.get(roomCode);
  if (!q) return null;

  const index = q.queue.findIndex((t) => t.id === trackId);
  if (index === -1) return null;

  const removed = q.queue.splice(index, 1)[0];

  if (index < q.currentIndex) {
    q.currentIndex--;
  } else if (index === q.currentIndex) {
    if (q.queue.length === 0) {
      q.currentIndex = -1;
    } else if (q.currentIndex >= q.queue.length) {
      q.currentIndex = q.queue.length - 1;
    }
  }

  return removed;
}

export function getCurrentTrack(roomCode: string): Track | null {
  const q = queues.get(roomCode);
  if (!q || q.currentIndex === -1 || q.currentIndex >= q.queue.length) return null;
  return q.queue[q.currentIndex];
}

export function removeCurrentAndGetNext(
  roomCode: string
): { removedId: string | null; nextTrack: Track | null } {
  const q = queues.get(roomCode);
  if (!q || q.currentIndex === -1 || q.queue.length === 0) {
    return { removedId: null, nextTrack: null };
  }

  const removedId = q.queue[q.currentIndex].id;
  q.queue.splice(q.currentIndex, 1);

  if (q.queue.length === 0) {
    q.currentIndex = -1;
    return { removedId, nextTrack: null };
  }

  if (q.currentIndex >= q.queue.length) {
    q.currentIndex = q.queue.length - 1;
  }

  return { removedId, nextTrack: q.queue[q.currentIndex] };
}

export function reorderQueue(roomCode: string, trackIds: string[]): boolean {
  const q = queues.get(roomCode);
  if (!q) return false;

  const currentTrackId = q.currentIndex >= 0 ? q.queue[q.currentIndex]?.id : null;
  const trackMap = new Map(q.queue.map((t) => [t.id, t]));
  const newQueue = trackIds.map((id) => trackMap.get(id)).filter((t): t is Track => t !== undefined);

  if (newQueue.length !== q.queue.length) return false;

  q.queue = newQueue;

  if (currentTrackId) {
    q.currentIndex = q.queue.findIndex((t) => t.id === currentTrackId);
  }

  return true;
}

export function skipToTrack(roomCode: string, trackId: string): Track | null {
  const q = queues.get(roomCode);
  if (!q) return null;

  const index = q.queue.findIndex((t) => t.id === trackId);
  if (index === -1) return null;

  q.currentIndex = index;
  return q.queue[index];
}

export function upvoteTrack(
  roomCode: string,
  trackId: string,
  socketId: string
): { voted: boolean; votes: number } | null {
  const q = queues.get(roomCode);
  if (!q) return null;

  const track = q.queue.find((t) => t.id === trackId);
  if (!track) return null;

  const previousVotedTrack = q.queue.find((t) => t.votedBy.has(socketId));

  if (previousVotedTrack && previousVotedTrack.id === trackId) {
    track.votedBy.delete(socketId);
    track.votes = Math.max(0, track.votes - 1);
  } else {
    if (previousVotedTrack) {
      previousVotedTrack.votedBy.delete(socketId);
      previousVotedTrack.votes = Math.max(0, previousVotedTrack.votes - 1);
    }
    track.votedBy.add(socketId);
    track.votes++;
  }

  const pivot = q.currentIndex + 1;
  const played = q.queue.slice(0, pivot);
  const upcoming = q.queue.slice(pivot);
  upcoming.sort((a, b) => b.votes - a.votes);
  q.queue = [...played, ...upcoming];

  return { voted: track.votedBy.has(socketId), votes: track.votes };
}

export function getQueue(roomCode: string): { queue: Track[]; currentIndex: number } {
  const q = queues.get(roomCode);
  if (!q) return { queue: [], currentIndex: -1 };
  return { queue: q.queue, currentIndex: q.currentIndex };
}

export function clearQueue(roomCode: string): void {
  queues.delete(roomCode);
}

function serializeTrack(t: Track): SerializedTrack {
  return {
    id: t.id,
    url: t.url,
    title: t.title,
    thumbnail: t.thumbnail,
    duration: t.duration,
    source: t.source,
    sourceId: t.sourceId,
    addedBy: t.addedBy,
    votes: t.votes,
  };
}

export function serializeQueue(roomCode: string): QueueState {
  const { queue, currentIndex } = getQueue(roomCode);
  return {
    tracks: queue.map(serializeTrack),
    currentIndex,
    currentTrack: currentIndex >= 0 ? serializeTrack(queue[currentIndex]) : null,
  };
}
