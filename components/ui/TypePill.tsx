import { cn } from '@/lib/utils';
import type { z } from 'zod';
import type { assignmentTypeSchema } from '@/lib/schemas';

export type AssignmentType = z.infer<typeof assignmentTypeSchema>;

export interface TypePillProps {
  type: AssignmentType;
  className?: string;
}

// Subtle neutral pill — the course chip is the colored anchor, the type pill
// is supporting metadata. DESIGN_TOKENS.md: rounded-sm, text-xs.
export function TypePill({ type, className }: TypePillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border border-ink-faint bg-bg-soft px-1.5 py-0.5 text-xs uppercase tracking-wide text-ink-soft',
        className
      )}
    >
      {type}
    </span>
  );
}
