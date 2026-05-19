import { cn } from '@/lib/utils';

export interface CourseChipProps {
  code: string;
  color: string; // hex from lib/colors.ts
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

const SIZE_CLASSES = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1.5',
  lg: 'text-sm px-2.5 py-1 gap-2',
} as const;

const DOT_SIZE = {
  sm: 5,
  md: 6,
  lg: 8,
} as const;

export function CourseChip({ code, color, size = 'md', className, title }: CourseChipProps) {
  const dot = DOT_SIZE[size];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center font-mono font-medium rounded-sm border tracking-wide whitespace-nowrap text-ink',
        SIZE_CLASSES[size],
        className
      )}
      // Arbitrary hex via inline style — DESIGN_TOKENS.md instructs this for course chips.
      style={{ background: color + '20', borderColor: color }}
    >
      <span
        className="rounded-full shrink-0"
        style={{ width: dot, height: dot, background: color }}
      />
      {code}
    </span>
  );
}
