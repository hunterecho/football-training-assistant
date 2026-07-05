import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  FileText,
  Settings as SettingsIcon,
  Dumbbell,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { to: '/', label: '今日计划', icon: CalendarDays },
  { to: '/schedule', label: '训练日程', icon: ListTodo },
  { to: '/templates', label: '训练模板', icon: Dumbbell },
  { to: '/import', label: '文档导入', icon: FileText },
  { to: '/settings', label: '个性设置', icon: SettingsIcon },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-theme-border bg-white">
      <div className="mx-auto flex max-w-2xl items-stretch px-2 py-2 overflow-x-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-xs transition-colors',
                isActive
                  ? 'bg-theme-accent text-white'
                  : 'text-theme-text-muted hover:bg-theme-accent-light hover:text-theme-text-secondary'
              )
            }
          >
            <item.icon className="h-5 w-5" strokeWidth={2} />
            <span className="max-w-[60px] truncate">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
