import { useEffect, useState } from 'react';
import { auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import TasksView from './TasksView';
import Diabetes from './Diabetes';
import Login from './Login';
import { BellRing, CheckSquare, Activity } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'tasks' | 'diabetes'>('tasks');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[100dvh] w-screen items-center justify-center bg-slate-50 flex-col gap-4" dir="rtl">
        <BellRing size={48} className="text-[#14243F] animate-pulse" />
        <span className="font-black text-slate-500 text-[18px]">جاري التحضير...</span>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-slate-50 overflow-hidden" dir="rtl">
      
      {/* منطقة المحتوى: تمرير مخفي للمهام لأنها تمرر داخلياً، وتمرير تلقائي للسكري */}
      <main className={`flex-1 w-full relative flex flex-col ${currentTab === 'tasks' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {currentTab === 'tasks' ? <TasksView /> : <Diabetes />}
      </main>

      {/* شريط التنقل السفلي */}
      <nav className="flex-none bg-white border-t border-slate-200 flex justify-around items-center h-[68px] w-full z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => setCurrentTab('tasks')}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            currentTab === 'tasks' ? 'text-[#3B3FB8]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <CheckSquare size={24} className={currentTab === 'tasks' ? 'fill-indigo-50' : ''} />
          <span className="text-[11px] font-bold">المهام والملاحظات</span>
        </button>

        <button
          onClick={() => setCurrentTab('diabetes')}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            currentTab === 'diabetes' ? 'text-[#3B3FB8]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Activity size={24} className={currentTab === 'diabetes' ? 'fill-indigo-50' : ''} />
          <span className="text-[11px] font-bold">متابعة السكري</span>
        </button>
      </nav>

    </div>
  );
}