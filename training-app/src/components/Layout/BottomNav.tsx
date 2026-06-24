import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  Timer,
  FileText,
  Settings as SettingsIcon,
  Dumbbell,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: '今日计划', icon: CalendarDays },
  { to: '/session', label: '训练计时', icon: Timer },
  { to: '/plans', label: '训练计划', icon: ListTodo },
  { to: '/templates', label: '模板', icon: Dumbbell },
  { to: '/import', label: '文档导入', icon: FileText },
  { to: '/settings', label: '设置', icon: SettingsIcon },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-slate-950/95 backdrop-blur supports-[backdrop-filter]:bg-slate-950/80">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2 py-2 overflow-x-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs transition-colors',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )
            }
          >
            <item.icon className="h-5 w-5" strokeWidth={2} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
