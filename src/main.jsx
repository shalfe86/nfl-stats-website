import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { 
  Trophy, Calendar, ChevronRight, ArrowLeft, Shield, Activity, 
  RefreshCw, Search, Menu, X, TrendingUp, Brain, Zap, 
  AlertTriangle, Sword, Home, Users, BarChart3, Clock
} from 'lucide-react';

// --- 1. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyD3-r1VdO69UNTdwUQOxACw7QAU8i996F0",
  authDomain: "nfl-stats-lab.firebaseapp.com",
  projectId: "nfl-stats-lab",
  storageBucket: "nfl-stats-lab.firebasestorage.app",
  messagingSenderId: "198834786644",
  appId: "1:198834786644:web:a0e1976f999d27e800f8c1",
  measurementId: "G-0D25D1MJJ3"
};

// Initialize Firebase
let app, auth, db;
try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "AIzaSyD3-r1VdO69UNTdwUQOxACw7QAU8i996F0") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.warn("⚠️ No Firebase Config. App will wait for config.");
  }
} catch (e) { console.error("Firebase Init Error:", e); }

const appId = 'default-app-id';

// --- 2. COMPONENTS ---

const LoadingScreen = () => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
    <RefreshCw className="animate-spin mb-4 text-indigo-500" size={32} />
    <p className="text-sm font-bold tracking-widest uppercase">Connecting to Live Data...</p>
  </div>
);

const TeamLogo = ({ id, size = 'md' }) => {
  const dims = size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-10 h-10 text-sm';
  const colorMap = {
    PHI: 'bg-emerald-900 text-emerald-400 border-emerald-700',
    DAL: 'bg-blue-900 text-blue-400 border-blue-700',
    NYG: 'bg-blue-800 text-red-400 border-blue-600',
    WAS: 'bg-red-900 text-yellow-400 border-red-700',
    // Default fallback for others
    DEFAULT: 'bg-slate-800 text-slate-400 border-slate-700'
  };
  const style = colorMap[id] || colorMap.DEFAULT;
  
  return (
    <div className={`${dims} rounded-full flex items-center justify-center font-black border shadow-lg ${style}`}>
      {id}
    </div>
  );
};

const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 ${
      active 
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
    }`}
  >
    <Icon size={20} />
    <span className="font-semibold">{label}</span>
  </button>
);

// --- 3. MAIN APP LOGIC ---

function NFLApp() {
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]); // Raw data from Firestore
  const [analytics, setAnalytics] = useState({}); // Raw stats from Firestore
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('home'); 
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  // Auth & Sync
  useEffect(() => {
    if (!auth) {
      setLoading(false); 
      return;
    }
    
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
      } else {
        await signInAnonymously(auth).catch(console.error);
      }
    });

    // 1. Subscribe to Team Records (The "Teams" collection)
    const unsubTeams = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'teams_2025_v2'), 
      (snapshot) => {
        const teamList = snapshot.docs.map(doc => doc.data());
        setTeams(teamList);
        setLoading(false); 
      }, 
      (err) => { console.error("Teams Sync Error:", err); setLoading(false); }
    );

    // 2. Subscribe to Analytics (The Python Script Output)
    const unsubStats = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'team_analytics'),
      (snapshot) => {
        const statsMap = {};
        snapshot.docs.forEach(doc => statsMap[doc.id] = doc.data());
        setAnalytics(statsMap);
      },
      (err) => console.error("Stats Sync Error:", err)
    );

    return () => { unsubAuth(); unsubTeams(); unsubStats(); };
  }, []);

  // --- HELPER FUNCTIONS ---
  
  const getTeam = (id) => teams.find(t => t.id === id);

  // Merge Record Data with Schedule Logic
  const getEnrichedTeam = (id) => {
    const team = getTeam(id);
    if (!team) return null;

    const teamStats = analytics[id] || {};
    
    // Calculate SOS based on remaining opponents
    const remOpponents = team.remainingOpponents || []; 
    let oppWins = 0, oppLosses = 0;
    
    const schedule = remOpponents.map((oppId, i) => {
      const opp = getTeam(oppId) || { wins: 0, losses: 0 };
      oppWins += (opp.wins || 0);
      oppLosses += (opp.losses || 0);
      return { week: 14 + i, oppId, w: opp.wins || 0, l: opp.losses || 0 };
    });

    const totalGames = oppWins + oppLosses;
    const sos = totalGames > 0 ? oppWins / totalGames : 0.500;

    return { ...team, sos, schedule, stats: teamStats.grades || {} };
  };

  // Get This Week's Games (First item in everyone's remaining schedule)
  const weeklyMatchups = useMemo(() => {
    const matches = [];
    const processed = new Set();
    
    teams.forEach(t => {
      const rem = t.remainingOpponents || [];
      if (rem.length > 0) {
        const oppId = rem[0];
        const matchId = [t.id, oppId].sort().join('-'); // Unique ID for the game
        
        if (!processed.has(matchId)) {
          processed.add(matchId);
          matches.push({ 
            home: t, 
            away: getTeam(oppId) || { id: oppId, wins: 0, losses: 0 }
          });
        }
      }
    });
    return matches;
  }, [teams]);

  // --- VIEWS ---

  const HomeView = () => (
    <div className="space-y-8 animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="relative bg-slate-900 border border-slate-800 p-8 rounded-3xl overflow-hidden">
        <div className="absolute top-0 right-0 p-12 bg-indigo-500/10 blur-3xl rounded-full"></div>
        <h1 className="text-4xl font-black text-white mb-2">Week 14 Command Center</h1>
        <p className="text-slate-400 max-w-md">
          Live analysis of the {weeklyMatchups.length} matchups kicking off this week. 
          Select a game to see the head-to-head breakdown.
        </p>
      </div>

      {/* Matchups Grid */}
      <div>
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="text-indigo-500" size={18} /> Current Slate
          </h2>
        </div>
        
        {weeklyMatchups.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500">
            {teams.length === 0 ? "Loading teams..." : "No upcoming matchups found in database."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weeklyMatchups.map((m, i) => (
              <div 
                key={i}
                onClick={() => { setSelectedTeamId(m.home.id); setView('detail'); }}
                className="bg-slate-900 border border-slate-800 p-4 rounded-2xl hover:border-indigo-500/50 hover:bg-slate-800 cursor-pointer transition-all group"
              >
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Week 14</span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                    <Activity size={10} /> PREVIEW
                  </div>
                </div>
                
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col items-center">
                    <TeamLogo id={m.away.id} />
                    <span className="font-black text-xl mt-2 text-white">{m.away.id}</span>
                    <span className="text-xs text-slate-500 font-mono">{m.away.wins}-{m.away.losses}</span>
                  </div>
                  
                  <div className="text-slate-700 font-black text-lg">AT</div>
                  
                  <div className="flex flex-col items-center">
                    <TeamLogo id={m.home.id} />
                    <span className="font-black text-xl mt-2 text-white">{m.home.id}</span>
                    <span className="text-xs text-slate-500 font-mono">{m.home.wins}-{m.home.losses}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-center">
                  <span className="text-xs font-bold text-indigo-400 group-hover:text-indigo-300 transition-colors">View Matchup Analysis &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const TeamsView = () => (
    <div className="space-y-6 pb-24 animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-2xl font-bold text-white">League Standings</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-2">
          <Search size={14} className="text-slate-500" />
          <span className="text-xs text-slate-500">Search...</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {teams.sort((a,b) => b.wins - a.wins).map((team, i) => (
          <div 
            key={team.id} 
            onClick={() => { setSelectedTeamId(team.id); setView('detail'); }}
            className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="text-slate-600 font-mono text-sm w-6 text-center">#{i+1}</span>
              <TeamLogo id={team.id} />
              <div>
                <div className="font-bold text-white">{team.name}</div>
                <div className="text-xs text-slate-400">{team.wins}-{team.losses}</div>
              </div>
            </div>
            <ChevronRight className="text-slate-600" size={20} />
          </div>
        ))}
      </div>
    </div>
  );

  const DetailView = () => {
    const team = getEnrichedTeam(selectedTeamId);
    if (!team) return <div>Loading...</div>;

    return (
      <div className="pb-24 space-y-8 animate-in slide-in-from-right-8 duration-300">
        {/* Nav Back */}
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={18} /> <span className="font-bold text-sm">Back</span>
        </button>

        {/* Team Header */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl text-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>
          <div className="inline-block mb-4 p-2 bg-slate-950 rounded-full border border-slate-800">
            <TeamLogo id={team.id} size="lg" />
          </div>
          <h1 className="text-3xl font-black text-white mb-1">{team.name}</h1>
          <div className="text-slate-400 font-mono text-lg">{team.wins}-{team.losses}</div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-800">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Schedule Difficulty</div>
              <div className={`text-xl font-black ${team.sos > .55 ? 'text-red-400' : 'text-emerald-400'}`}>
                {team.sos.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Offense Grade</div>
              <div className="text-xl font-black text-indigo-400">
                {team.stats.offense ? team.stats.offense.toFixed(1) : '--'}
              </div>
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div>
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Calendar size={18} className="text-indigo-500" /> Upcoming Games
          </h3>
          <div className="space-y-3">
            {team.schedule.length === 0 ? (
              <div className="p-8 text-center text-slate-500 italic bg-slate-900 rounded-xl border border-slate-800">No games remaining.</div>
            ) : team.schedule.map((game, i) => (
              <div key={i} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex flex-col items-center justify-center">
                    <span className="text-[8px] uppercase font-bold text-slate-500">WK</span>
                    <span className="text-sm font-bold text-white">{game.week}</span>
                  </div>
                  <div>
                    <div className="font-bold text-white text-lg">{game.oppId}</div>
                    <div className="text-xs text-slate-500 font-mono">Opp Rec: {game.w}-{game.l}</div>
                  </div>
                </div>
                {/* Simple Win Probability Visual */}
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase text-slate-600 mb-1">Win Prob</div>
                  <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500" 
                      style={{width: `${Math.min(Math.max((team.wins / (team.wins + game.w || 1)) * 100, 10), 90)}%`}} 
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // --- RENDER ---
  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans flex">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-900 hidden md:flex flex-col p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Shield className="text-white" size={18} />
          </div>
          <span className="font-black text-lg tracking-tight text-white">NFL LAB</span>
        </div>
        <nav className="space-y-2 flex-1">
          <NavItem icon={Home} label="Overview" active={view === 'home'} onClick={() => setView('home')} />
          <NavItem icon={Users} label="Teams" active={view === 'teams'} onClick={() => setView('teams')} />
        </nav>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 p-4 z-50 flex justify-between items-center">
        <span className="font-black text-lg text-white flex items-center gap-2">
          <Shield className="text-indigo-500" size={20} /> NFL LAB
        </span>
      </div>

      {/* Main Area */}
      <main className="flex-1 relative overflow-y-auto h-screen pt-16 md:pt-0">
        <div className="max-w-3xl mx-auto p-4 md:p-10">
          {view === 'home' && <HomeView />}
          {view === 'teams' && <TeamsView />}
          {view === 'detail' && <DetailView />}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950 border-t border-slate-900 p-2 flex justify-around z-50 pb-safe">
        <button onClick={() => setView('home')} className={`p-3 rounded-xl ${view === 'home' ? 'text-indigo-400' : 'text-slate-600'}`}>
          <Home size={24} />
        </button>
        <button onClick={() => setView('teams')} className={`p-3 rounded-xl ${view === 'teams' ? 'text-indigo-400' : 'text-slate-600'}`}>
          <Users size={24} />
        </button>
      </div>
    </div>
  );
}

// --- ROBUST RENDER LOGIC ---
const container = document.getElementById('root');
if (container) {
  // Prevent HMR crash by reusing root if it exists
  const root = container._reactRoot ||= createRoot(container);
  root.render(<NFLApp />);
}main.jsx
