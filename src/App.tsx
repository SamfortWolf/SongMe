import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  setDoc, 
  getDoc,
  where,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, db, googleProvider } from './firebase';
import { 
  Music, 
  Plus, 
  LogOut, 
  MessageSquare, 
  Users, 
  Send, 
  ArrowLeft,
  Search,
  Volume2,
  Play,
  SkipForward,
  SkipBack,
  CheckCircle2,
  Trophy,
  UserCircle,
  Camera,
  X,
  ChevronRight,
  RotateCcw
} from 'lucide-react';
import YouTube from 'react-youtube';
import confetti from 'canvas-confetti';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { storage } from './firebase';

// --- Utility ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastActive: any;
}

interface Room {
  id: string;
  name: string;
  creatorId: string;
  createdAt: any;
  status: 'waiting' | 'playing' | 'finished';
  currentSongIndex: number;
  songsPerPlayer: number;
  shuffledPlaylist: Song[];
  participants: string[];
}

interface Participant {
  uid: string;
  displayName: string;
  photoURL?: string;
  points: number;
  ready: boolean;
  songsCount: number;
}

interface Message {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: any;
}

interface Song {
  id: string;
  title: string;
  videoId: string;
  thumbnail: string;
  createdAt: any;
  addedBy?: string;
  addedByName?: string;
  revealed?: boolean;
}

interface Vote {
  voterId: string;
  votedForId: string;
  songId: string;
}

// --- Sub-components ---

const AvatarUpload = ({ user, onUpdate }: { user: FirebaseUser, onUpdate: (url: string) => void }) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      onUpdate(url);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative group">
      <img 
        src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
        className="w-10 h-10 rounded-full border border-zinc-800 object-cover"
        alt="Avatar"
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        disabled={uploading}
      >
        {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
      </button>
      <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />
    </div>
  );
};

const ParticipantsList = ({ 
  participants, 
  creatorId, 
  currentUserId, 
  status, 
  songsPerPlayer,
  onKick 
}: { 
  participants: Participant[], 
  creatorId: string, 
  currentUserId: string, 
  status: string, 
  songsPerPlayer: number,
  onKick: (uid: string) => void 
}) => {
  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Participants</h3>
      <div className="space-y-2">
        {participants.map((p) => (
          <div key={p.uid} className="flex items-center justify-between group bg-zinc-900/30 p-2 rounded-xl border border-transparent hover:border-zinc-800 transition-all">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img src={p.photoURL || `https://ui-avatars.com/api/?name=${p.displayName}`} className="w-8 h-8 rounded-full object-cover" alt="" />
                {p.uid === creatorId && <div className="absolute -top-1 -right-1 bg-yellow-500 w-3 h-3 rounded-full border-2 border-black flex items-center justify-center text-[6px] text-black font-bold">★</div>}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium truncate max-w-[100px]">{p.displayName}</span>
                {status === 'waiting' ? (
                  <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-tighter">
                    {p.songsCount} / {songsPerPlayer} Songs
                  </span>
                ) : (
                  <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-tighter">
                    {Math.floor(p.points / 10)} Guessed
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status === 'waiting' && (
                p.ready ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <div className="w-4 h-4 rounded-full border-2 border-zinc-800" />
              )}
              {currentUserId === creatorId && p.uid !== currentUserId && (
                <button 
                  onClick={() => onKick(p.uid)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Playlist = ({ 
  songs, 
  status, 
  currentUserId, 
  currentSongIndex, 
  onPlay,
  onDelete
}: { 
  songs: Song[], 
  status: string, 
  currentUserId: string, 
  currentSongIndex: number, 
  onPlay: (index: number) => void,
  onDelete?: (songId: string) => void
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1 mb-4">Playlist</h3>
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
        {songs.map((song, index) => {
          const isPlayed = status === 'playing' && index < currentSongIndex;
          const isCurrent = status === 'playing' && index === currentSongIndex;
          
          return (
            <div 
              key={song.id} 
              onClick={() => onPlay(index)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onPlay(index)}
              className={cn(
                "w-full text-left p-2 rounded-xl border transition-all group/item cursor-pointer",
                isCurrent ? "bg-emerald-500/10 border-emerald-500/30" : "bg-zinc-900/30 border-transparent hover:border-zinc-800",
                isPlayed && "opacity-50 grayscale"
              )}
            >
              <div className="flex gap-3">
                <div className="relative">
                  <img src={song.thumbnail} className="w-16 h-12 object-cover rounded-lg" alt="" />
                  {isCurrent && <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center rounded-lg"><Play className="w-4 h-4 text-emerald-500" /></div>}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold line-clamp-1">{song.title}</h4>
                    {status === 'waiting' && onDelete && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(song.id);
                        }}
                        className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-red-500/20 text-red-500 rounded transition-all"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {isPlayed && (
                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-1 flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Replay
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-1 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> Now Playing
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {songs.length === 0 && (
          <div className="text-center py-10 text-zinc-600 text-xs italic">
            No songs added yet
          </div>
        )}
      </div>
    </div>
  );
};

const YouTubePlayer = ({ videoId, onEnd }: { videoId: string, onEnd: () => void }) => {
  return (
    <div className="aspect-video w-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-zinc-800">
      <YouTube
        videoId={videoId}
        opts={{
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
          },
        }}
        onEnd={onEnd}
        className="w-full h-full"
      />
    </div>
  );
};

const VotingStage = ({ 
  participants, 
  onVote, 
  votes, 
  currentUserId, 
  isRevealed, 
  correctAuthorId 
}: { 
  participants: Participant[], 
  onVote: (uid: string) => void, 
  votes: Vote[], 
  currentUserId: string, 
  isRevealed: boolean, 
  correctAuthorId?: string 
}) => {
  const myVote = votes.find(v => v.voterId === currentUserId);
  
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold tracking-tight">Who added this song?</h3>
        <p className="text-zinc-500 text-sm">Cast your vote to reveal the truth</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {participants.map((p) => {
          const voteCount = votes.filter(v => v.votedForId === p.uid).length;
          const isCorrect = isRevealed && p.uid === correctAuthorId;
          const isWrong = isRevealed && myVote?.votedForId === p.uid && p.uid !== correctAuthorId;
          const hasVotedForThis = myVote?.votedForId === p.uid;

          return (
            <button
              key={p.uid}
              disabled={!!myVote || isRevealed}
              onClick={() => onVote(p.uid)}
              className={cn(
                "relative group p-4 rounded-2xl border transition-all flex flex-col items-center gap-3",
                hasVotedForThis ? "bg-emerald-500/20 border-emerald-500" : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700",
                isCorrect && "bg-emerald-500/40 border-emerald-500 ring-4 ring-emerald-500/20",
                isWrong && "bg-red-500/20 border-red-500 opacity-50"
              )}
            >
              <div className="relative">
                <img src={p.photoURL || `https://ui-avatars.com/api/?name=${p.displayName}`} className="w-12 h-12 rounded-full object-cover" alt="" />
                {isCorrect && <div className="absolute -top-2 -right-2 bg-emerald-500 p-1 rounded-full"><CheckCircle2 className="w-3 h-3 text-black" /></div>}
              </div>
              <span className="text-xs font-bold truncate w-full text-center">{p.displayName}</span>
              
              <div className="flex gap-1 mt-1">
                {votes.filter(v => v.votedForId === p.uid).map((v) => (
                  <div key={v.voterId} className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const YouTubeSearch = ({ onAdd }: { onAdd: (video: any) => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.items || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="relative">
        <input 
          type="text"
          placeholder="Search YouTube..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 pl-11 focus:outline-none focus:border-emerald-500"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
      </form>

      <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
        {results.map((item) => (
          <div key={item.id.videoId || item.etag} className="flex gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800 group hover:border-emerald-500/30 transition-colors">
            <img src={item.snippet.thumbnails.default.url} className="w-24 h-18 object-cover rounded-lg" alt="" />
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <h4 className="text-sm font-bold line-clamp-2 leading-tight">{item.snippet.title}</h4>
              <button 
                onClick={() => onAdd(item)}
                className="mt-2 text-[10px] font-bold uppercase tracking-widest bg-emerald-500 text-black px-3 py-1.5 rounded-lg hover:bg-emerald-400 transition-colors w-fit"
              >
                Add to Playlist
              </button>
            </div>
          </div>
        ))}
        {loading && <div className="text-center py-4 text-zinc-500">Searching...</div>}
      </div>
    </div>
  );
};

const Login = () => {
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Save user profile
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: user.displayName || 'Anonymous',
        photoURL: user.photoURL || '',
        lastActive: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] text-white p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center space-y-8"
      >
        <div className="space-y-4">
          <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <Music className="w-10 h-10 text-black" />
          </div>
          <h1 className="text-5xl font-bold tracking-tighter">MUSIC LOBBY</h1>
          <p className="text-zinc-400 text-lg">Connect, chat, and share music in real-time.</p>
        </div>

        <button
          onClick={handleLogin}
          className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors flex items-center justify-center gap-3 text-lg"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Continue with Google
        </button>
      </motion.div>
    </div>
  );
};

const Lobby = ({ user, onJoinRoom }: { user: FirebaseUser, onJoinRoom: (room: Room) => void }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [songsPerPlayer, setSongsPerPlayer] = useState(2);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
      setRooms(roomsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rooms');
    });
    return unsubscribe;
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    try {
      await addDoc(collection(db, 'rooms'), {
        name: newRoomName,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
        status: 'waiting',
        currentSongIndex: 0,
        songsPerPlayer: songsPerPlayer,
        shuffledPlaylist: [],
        participants: [user.uid]
      });
      setNewRoomName('');
      setIsCreating(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'rooms');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Active Rooms</h2>
        <button 
          onClick={() => setIsCreating(true)}
          className="p-3 bg-emerald-500 text-black rounded-full hover:bg-emerald-400 transition-colors"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <AnimatePresence>
        {isCreating && (
          <motion.form 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleCreateRoom}
            className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 space-y-4 overflow-hidden"
          >
            <h3 className="text-lg font-semibold">Create New Room</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Room Name</label>
                <input 
                  type="text"
                  placeholder="Room Name..."
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Songs per Player</label>
                <input 
                  type="number"
                  min="1"
                  max="10"
                  value={songsPerPlayer}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSongsPerPlayer(isNaN(val) ? 1 : val);
                  }}
                  className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="flex gap-4 pt-2">
              <button type="submit" className="flex-1 py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400">
                Create Room
              </button>
              <button 
                type="button" 
                onClick={() => setIsCreating(false)}
                className="px-6 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700"
              >
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rooms.map((room) => (
          <motion.div
            key={room.id}
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => onJoinRoom(room)}
            className="group bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800 hover:border-emerald-500/50 transition-all cursor-pointer relative overflow-hidden"
          >
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold truncate pr-4">{room.name}</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-sm font-medium">
                      <Users className="w-4 h-4" />
                      {room.participants?.length || 0}
                    </div>
                    {room.creatorId === user.uid && (
                      <div className="flex items-center gap-1">
                        {deletingRoomId === room.id ? (
                          <>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await deleteDoc(doc(db, 'rooms', room.id));
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.DELETE, `rooms/${room.id}`);
                                } finally {
                                  setDeletingRoomId(null);
                                }
                              }}
                              className="px-2 py-1 bg-red-500 text-white text-[10px] rounded hover:bg-red-600"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingRoomId(null);
                              }}
                              className="px-2 py-1 bg-zinc-800 text-white text-[10px] rounded hover:bg-zinc-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingRoomId(room.id);
                            }}
                            className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
              </div>
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                {room.status === 'playing' ? 'Game in progress' : 'Waiting for players'}
              </div>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
          </motion.div>
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full py-20 text-center text-zinc-500 border-2 border-dashed border-zinc-800 rounded-3xl">
            No active rooms. Create one to get started!
          </div>
        )}
      </div>
    </div>
  );
};

const RoomView = ({ room: initialRoom, user, onLeave }: { room: Room, user: FirebaseUser, onLeave: () => void }) => {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [messages, setMessages] = useState<Message[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [enrichedSongs, setEnrichedSongs] = useState<Song[]>([]);
  const [myPrivateSongs, setMyPrivateSongs] = useState<Record<string, any>>({});
  const [votes, setVotes] = useState<Vote[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const showNotification = (message: string, type: 'error' | 'success' = 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    // 1. Join/Update Participant
    const setupParticipant = async () => {
      const pRef = doc(db, 'rooms', initialRoom.id, 'participants', user.uid);
      try {
        await setDoc(pRef, {
          uid: user.uid,
          displayName: user.displayName || 'Anonymous',
          photoURL: user.photoURL,
          points: 0,
          ready: false,
          songsCount: 0,
          lastSeen: serverTimestamp()
        }, { merge: true });

        await updateDoc(doc(db, 'rooms', initialRoom.id), {
          participants: arrayUnion(user.uid)
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `rooms/${initialRoom.id}/participants/${user.uid}`);
      }
    };
    setupParticipant();

    // 2. Room Sync
    const unsubscribeRoom = onSnapshot(doc(db, 'rooms', initialRoom.id), (snapshot) => {
      if (snapshot.exists()) {
        setRoom({ id: snapshot.id, ...snapshot.data() } as Room);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `rooms/${initialRoom.id}`);
    });

    // 3. Participants Sync
    const unsubscribeParticipants = onSnapshot(collection(db, 'rooms', initialRoom.id, 'participants'), (snapshot) => {
      setParticipants(snapshot.docs.map(doc => doc.data() as Participant));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${initialRoom.id}/participants`);
    });

    // 4. Messages Sync
    const qMessages = query(collection(db, 'rooms', initialRoom.id, 'messages'), orderBy('createdAt', 'asc'));
    const unsubscribeMessages = onSnapshot(qMessages, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${initialRoom.id}/messages`);
    });

    // 5. Songs Sync
    const qSongs = query(collection(db, 'rooms', initialRoom.id, 'songs'), orderBy('createdAt', 'asc'));
    const unsubscribeSongs = onSnapshot(qSongs, (snapshot) => {
      const songsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Song));
      setSongs(songsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${initialRoom.id}/songs`);
    });

    // Sync my private songs to avoid delay
    const qMyPrivate = query(collection(db, 'rooms', initialRoom.id, 'songs_private'), where('addedBy', '==', user.uid));
    const unsubscribeMyPrivate = onSnapshot(qMyPrivate, (snapshot) => {
      const privateData = snapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = doc.data();
        return acc;
      }, {} as Record<string, any>);
      setMyPrivateSongs(privateData);
    });

    return () => {
      unsubscribeRoom();
      unsubscribeParticipants();
      unsubscribeMessages();
      unsubscribeSongs();
      unsubscribeMyPrivate();
    };
  }, [initialRoom.id, user.uid]); // Minimal dependencies to keep listeners stable

  // Separate effect for song enrichment (private data)
  useEffect(() => {
    if (songs.length === 0) return;

    const enrichSongs = async () => {
      const enriched = await Promise.all(songs.map(async (s) => {
        // If it's my song, we already have it from myPrivateSongs sync
        if (myPrivateSongs[s.id]) {
          return { ...s, ...myPrivateSongs[s.id] };
        }
        
        try {
          const pDoc = await getDoc(doc(db, 'rooms', initialRoom.id, 'songs_private', s.id));
          if (pDoc.exists()) return { ...s, ...pDoc.data() };
        } catch {}
        return s;
      }));

      setEnrichedSongs(enriched);
      
      // Update my readiness based on enriched data
      const myCount = enriched.filter(s => s.addedBy === user.uid).length;
      const pRef = doc(db, 'rooms', initialRoom.id, 'participants', user.uid);
      const required = room.songsPerPlayer || 2;
      
      updateDoc(pRef, {
        songsCount: myCount,
        ready: myCount >= required
      }).catch((err) => {
        console.error("Failed to update readiness:", err);
      });
    };

    enrichSongs();
  }, [songs, myPrivateSongs, room.status, room.creatorId, user.uid, initialRoom.id, room.songsPerPlayer]);

  // Votes Sync (only in playing state)
  useEffect(() => {
    if (room.status !== 'playing') {
      setVotes([]);
      return;
    }
    const currentSong = room.shuffledPlaylist?.[room.currentSongIndex];
    if (!currentSong) return;

    const qVotes = query(collection(db, 'rooms', initialRoom.id, 'votes'), where('songId', '==', currentSong.id));
    return onSnapshot(qVotes, (snapshot) => {
      setVotes(snapshot.docs.map(doc => doc.data() as Vote));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${initialRoom.id}/votes`);
    });
  }, [room.status, room.currentSongIndex, room.shuffledPlaylist, initialRoom.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    try {
      await addDoc(collection(db, 'rooms', room.id, 'messages'), {
        roomId: room.id,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        text: newMessage,
        createdAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `rooms/${room.id}/messages`);
    }
  };

  const handleAddSong = async (video: any) => {
    if (room.status !== 'waiting') {
      showNotification("Game has already started!");
      return;
    }

    const mySongs = enrichedSongs.filter(s => s.addedBy === user.uid);
    const required = room.songsPerPlayer || 2;
    if (mySongs.length >= required) {
      showNotification(`You can only add ${required} songs!`);
      return;
    }

    const isDuplicate = songs.some(s => s.videoId === video.id.videoId);
    if (isDuplicate) {
      showNotification("This song is already in the playlist!");
      return;
    }

    try {
      const songRef = await addDoc(collection(db, 'rooms', room.id, 'songs'), {
        title: video.snippet.title,
        videoId: video.id.videoId,
        thumbnail: video.snippet.thumbnails.high.url,
        createdAt: serverTimestamp()
      });
      await setDoc(doc(db, 'rooms', room.id, 'songs_private', songRef.id), {
        addedBy: user.uid,
        addedByName: user.displayName || 'Anonymous'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rooms/${room.id}/songs`);
    }
  };

  const handleDeleteSong = async (songId: string) => {
    try {
      await deleteDoc(doc(db, 'rooms', room.id, 'songs', songId));
      await deleteDoc(doc(db, 'rooms', room.id, 'songs_private', songId));
      showNotification("Song removed", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `rooms/${room.id}/songs/${songId}`);
    }
  };

  const handleStartGame = async () => {
    if (room.creatorId !== user.uid) return;
    const allReady = participants.every(p => p.ready);
    if (!allReady) {
      showNotification("Not everyone is ready yet!");
      return;
    }

    // Shuffle songs
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        status: 'playing',
        currentSongIndex: 0,
        shuffledPlaylist: shuffled
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const handleVote = async (votedForId: string) => {
    const currentSong = room.shuffledPlaylist?.[room.currentSongIndex];
    if (!currentSong) return;

    try {
      await setDoc(doc(db, 'rooms', room.id, 'votes', `${user.uid}_${currentSong.id}`), {
        voterId: user.uid,
        votedForId,
        songId: currentSong.id,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rooms/${room.id}/votes/${user.uid}_${currentSong.id}`);
    }
  };

  const handleReveal = async () => {
    const currentSong = room.shuffledPlaylist?.[room.currentSongIndex];
    if (!currentSong) return;

    try {
      console.log(`Starting handleReveal. Host: ${room.creatorId}, User: ${user.uid}`);
      // Fetch correct author
      const pDoc = await getDoc(doc(db, 'rooms', room.id, 'songs_private', currentSong.id));
      const authorId = pDoc.data()?.addedBy;

      if (!authorId) {
        console.error("Could not find author for song:", currentSong.id);
        return;
      }

      console.log(`Found author: ${authorId} (${pDoc.data()?.addedByName})`);

      // Update song as revealed in both collections and the shuffled playlist
      const newPlaylist = [...room.shuffledPlaylist];
      newPlaylist[room.currentSongIndex] = { 
        ...newPlaylist[room.currentSongIndex], 
        revealed: true,
        addedBy: authorId,
        addedByName: pDoc.data()?.addedByName
      };

      console.log("Updating shuffledPlaylist on room...");
      await updateDoc(doc(db, 'rooms', room.id), {
        shuffledPlaylist: newPlaylist
      });

      console.log("Updating song in subcollection...");
      await updateDoc(doc(db, 'rooms', room.id, 'songs', currentSong.id), {
        revealed: true
      });

      // Award points
      const winners = votes.filter(v => v.votedForId === authorId);
      console.log(`Revealing author: ${authorId}. Found ${winners.length} winners.`);
      
      for (const win of winners) {
        const pRef = doc(db, 'rooms', room.id, 'participants', win.voterId);
        console.log(`Awarding 10 points to ${win.voterId}`);
        await updateDoc(pRef, { points: increment(10) });
      }

      if (winners.length > 0) confetti();
    } catch (error) {
      console.error("Error in handleReveal:", error);
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const handleNext = async () => {
    try {
      if (room.currentSongIndex + 1 < room.shuffledPlaylist.length) {
        await updateDoc(doc(db, 'rooms', room.id), {
          currentSongIndex: increment(1)
        });
      } else {
        await updateDoc(doc(db, 'rooms', room.id), {
          status: 'finished'
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const currentSong = room.shuffledPlaylist?.[room.currentSongIndex];
  const previewSong = previewVideoId ? room.shuffledPlaylist?.find(s => s.videoId === previewVideoId) : null;
  const displaySong = previewSong || currentSong;
  const isPreview = !!previewVideoId;
  const allVoted = votes.length >= (room.participants?.length || 0);

  return (
    <div className="h-screen flex bg-[#050505] text-white overflow-hidden">
      {/* Left Panel: Info & Playlist */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/20">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onLeave} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-bold truncate">{room.name}</h2>
          </div>
          <AvatarUpload user={user} onUpdate={async (url) => {
            try {
              await updateDoc(doc(db, 'rooms', room.id, 'participants', user.uid), { photoURL: url });
              await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
            } catch (error) {
              handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}/participants/${user.uid}`);
            }
          }} />
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          <ParticipantsList 
            participants={participants} 
            creatorId={room.creatorId} 
            currentUserId={user.uid} 
            status={room.status}
            songsPerPlayer={room.songsPerPlayer || 2}
            onKick={async (uid) => {
              try {
                await updateDoc(doc(db, 'rooms', room.id), { participants: arrayRemove(uid) });
                await deleteDoc(doc(db, 'rooms', room.id, 'participants', uid));
              } catch (error) {
                handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
              }
            }}
          />
          <Playlist 
            songs={room.status === 'waiting' ? enrichedSongs.filter(s => s.addedBy === user.uid) : room.shuffledPlaylist || []}
            status={room.status}
            currentUserId={user.uid}
            currentSongIndex={room.currentSongIndex}
            onPlay={async (idx) => {
              // Only allow playing current or previous songs
              if (room.status === 'playing' && idx <= room.currentSongIndex) {
                setPreviewVideoId(room.shuffledPlaylist[idx].videoId);
              }
            }}
            onDelete={room.status === 'waiting' ? handleDeleteSong : undefined}
          />
        </div>
      </div>

      {/* Center Panel: Main Stage */}
      <div className="flex-1 flex flex-col bg-black relative">
        <AnimatePresence>
          {notification && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={cn(
                "absolute top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2",
                notification.type === 'error' ? "bg-red-500 text-white" : "bg-emerald-500 text-black"
              )}
            >
              {notification.type === 'error' ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {notification.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
          <AnimatePresence mode="wait">
            {isPreview && displaySong ? (
              <motion.div 
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter text-emerald-500">Preview Mode</h2>
                  <button 
                    onClick={() => setPreviewVideoId(null)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Back to Game
                  </button>
                </div>
                <YouTubePlayer videoId={displaySong.videoId} onEnd={() => {}} />
                
                {displaySong.revealed && (
                  <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-2">
                    <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Added by</p>
                    <p className="text-2xl font-black text-emerald-500 italic uppercase tracking-tighter">{displaySong.addedByName || 'Unknown'}</p>
                  </div>
                )}
              </motion.div>
            ) : room.status === 'waiting' ? (
              <motion.div 
                key="waiting"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="text-center space-y-4">
                  <h1 className="text-4xl font-black tracking-tighter uppercase italic">Waiting for Players</h1>
                  <p className="text-zinc-500">Add {room.songsPerPlayer || 2} songs to start the game.</p>
                </div>
                
                <YouTubeSearch onAdd={handleAddSong} />

                {room.creatorId === user.uid && (
                  <div className="pt-8 flex justify-center">
                    <button 
                      onClick={handleStartGame}
                      className="px-12 py-4 bg-emerald-500 text-black font-black uppercase tracking-widest rounded-full hover:scale-105 transition-transform shadow-2xl shadow-emerald-500/20 disabled:opacity-50"
                      disabled={!participants.every(p => p.ready)}
                    >
                      Start Game
                    </button>
                  </div>
                )}
              </motion.div>
            ) : room.status === 'playing' && currentSong ? (
              <motion.div 
                key="playing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">Now Guessing</p>
                    <h2 className="text-2xl font-black truncate max-w-md">{currentSong.title}</h2>
                  </div>
                  <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl">
                    <span className="text-emerald-500 font-black">{room.currentSongIndex + 1}</span>
                    <span className="text-zinc-600 mx-2">/</span>
                    <span className="text-zinc-400 font-bold">{room.shuffledPlaylist.length}</span>
                  </div>
                </div>

                <YouTubePlayer videoId={currentSong.videoId} onEnd={() => {}} />
                
                <div className="space-y-6">
                  <VotingStage 
                    participants={participants}
                    votes={votes}
                    currentUserId={user.uid}
                    onVote={handleVote}
                    isRevealed={!!currentSong.revealed}
                    correctAuthorId={currentSong.revealed ? currentSong.addedBy : undefined}
                  />

                  <div className="flex flex-col items-center gap-4">
                    {room.creatorId === user.uid && allVoted && (
                      <div className="flex justify-center">
                        {!currentSong.revealed ? (
                          <button 
                            onClick={handleReveal}
                            className="px-12 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                          >
                            Reveal Result
                          </button>
                        ) : (
                          <div className="flex gap-4">
                            {room.currentSongIndex + 1 < room.shuffledPlaylist.length ? (
                              <button 
                                onClick={handleNext}
                                className="px-12 py-4 bg-white hover:bg-zinc-200 text-black font-black uppercase tracking-widest rounded-2xl transition-all hover:scale-105 active:scale-95"
                              >
                                Next Track
                              </button>
                            ) : (
                              <button 
                                onClick={handleNext}
                                className="px-12 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                              >
                                End the Game
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!allVoted && !currentSong.revealed && (
                      <div className="flex items-center gap-3 px-6 py-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                        <div className="flex -space-x-2">
                          {participants.map((p) => {
                            const hasVoted = votes.some(v => v.voterId === p.uid);
                            return (
                              <div 
                                key={p.uid}
                                className={cn(
                                  "w-8 h-8 rounded-full border-2 border-black overflow-hidden transition-all",
                                  hasVoted ? "opacity-100 scale-110 z-10" : "opacity-30 grayscale"
                                )}
                              >
                                <img src={p.photoURL || `https://ui-avatars.com/api/?name=${p.displayName}`} alt="" />
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">
                          Waiting for votes ({votes.length}/{room.participants?.length || 0})
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="finished"
                className="text-center py-20 space-y-8"
              >
                <div className="space-y-4">
                  <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                    <Trophy className="w-10 h-10 text-black" />
                  </div>
                  <h1 className="text-6xl font-black italic uppercase tracking-tighter">Game Over</h1>
                </div>

                <div className="max-w-md mx-auto space-y-4">
                  {participants.sort((a, b) => b.points - a.points).map((p, i) => (
                    <motion.div 
                      key={p.uid}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border",
                        i === 0 ? "bg-emerald-500/10 border-emerald-500" : "bg-zinc-900 border-zinc-800"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <span className={cn("text-2xl font-black", i === 0 ? "text-emerald-500" : "text-zinc-700")}>#{i + 1}</span>
                        <img src={p.photoURL || `https://ui-avatars.com/api/?name=${p.displayName}`} className="w-10 h-10 rounded-full object-cover" alt="" />
                        <span className="font-bold">{p.displayName}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-500 font-black">{p.points} pts</p>
                        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{Math.floor(p.points / 10)} Guessed</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                  {room.creatorId === user.uid && (
                    <button 
                      onClick={() => updateDoc(doc(db, 'rooms', room.id), { status: 'waiting', currentSongIndex: 0, shuffledPlaylist: [] })}
                      className="px-8 py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-colors"
                    >
                      Play Again
                    </button>
                  )}
                  <button 
                    onClick={onLeave}
                    className="px-8 py-3 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-colors"
                  >
                    Back to Lobby
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Panel: Chat */}
      <div className="w-72 border-l border-zinc-800 flex flex-col bg-zinc-900/20">
        <div className="p-6 border-b border-zinc-800">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Live Chat</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
          {messages.map((msg) => (
            <div key={msg.id} className={cn("space-y-1", msg.senderId === user.uid ? "text-right" : "text-left")}>
              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">{msg.senderName}</p>
              <div className={cn(
                "inline-block px-3 py-2 rounded-xl text-xs",
                msg.senderId === user.uid ? "bg-emerald-500 text-black" : "bg-zinc-800 text-white"
              )}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-800">
          <div className="relative">
            <input 
              type="text"
              placeholder="Say something..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 pr-10 text-xs focus:outline-none focus:border-emerald-500"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-emerald-500">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-emerald-500 selection:text-black">
      <AnimatePresence mode="wait">
        {currentRoom ? (
          <motion.div
            key="room"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="h-screen"
          >
            <RoomView 
              room={currentRoom} 
              user={user} 
              onLeave={() => setCurrentRoom(null)} 
            />
          </motion.div>
        ) : (
          <motion.div
            key="lobby"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <header className="p-6 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-[#050505]/80 backdrop-blur-xl z-20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                  <Music className="w-6 h-6 text-black" />
                </div>
                <h1 className="text-xl font-bold tracking-tighter">MUSIC LOBBY</h1>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-bold">{user.displayName}</span>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Active Now</span>
                </div>
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                  className="w-10 h-10 rounded-full border border-zinc-800"
                  alt="Profile"
                />
                <button 
                  onClick={() => signOut(auth)}
                  className="p-2 hover:bg-zinc-900 rounded-full text-zinc-500 hover:text-white transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </header>

            <main className="pb-20">
              <Lobby user={user} onJoinRoom={setCurrentRoom} />
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
