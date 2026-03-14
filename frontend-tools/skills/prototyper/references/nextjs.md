# Next.js Prototyper Reference

## Output Structure

```
src/app/(prototypes)/exp/{name}/
├── page.tsx          # The prototype UI (React component)
├── layout.tsx        # Prototype guard + minimal shell
└── mock-data.ts      # Typed mock data
```

## First-Time Setup

### Shared Layout

Create `src/app/(prototypes)/layout.tsx`:

```tsx
import { isPrototypeEnabled } from '@/lib/env'; // or wherever the util lives
import { notFound } from 'next/navigation';

export default function PrototypeLayout({ children }: { children: React.ReactNode }) {
  if (!isPrototypeEnabled()) notFound();

  return (
    <div className="min-h-screen">
      <div className="fixed top-2 right-2 z-50 rounded bg-amber-500 px-2 py-1 text-xs font-bold text-white shadow-lg">
        PROTOTYPE
      </div>
      {children}
    </div>
  );
}
```

### Auth Middleware Bypass

If the project has `src/middleware.ts` with auth protection, add the prototype path to the matcher exclusion:

```typescript
// In the matcher config, add:
'/((?!.*\\..*|_next|exp).*)'
// Or add to the public routes array:
'/exp/:path*'
```

Search middleware for `matcher` or `publicRoutes` and add the exclusion.

### Output Directory

Default: `src/app/(prototypes)/exp/`

The `(prototypes)` route group keeps it out of the URL path and isolates it from the main app's layouts.

### Gitignore

Add to `.gitignore`:
```
src/app/(prototypes)/exp/*/
```

## File Templates

### page.tsx

```tsx
'use client';

import { useState } from 'react';
// In constrained mode: import real components
// import { Button, Card } from '@/components/ui';
// In creative mode: use any HTML + Tailwind

import { mockData } from './mock-data';

export default function PrototypeName() {
  const [state, setState] = useState(initialValue);

  return (
    <div className="min-h-screen bg-background">
      {/* Prototype content */}
    </div>
  );
}
```

### layout.tsx (per prototype)

Only create if the prototype needs its own layout (e.g., specific metadata). Otherwise the shared `(prototypes)/layout.tsx` handles it.

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prototype: Feature Name',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

### mock-data.ts

```typescript
// Import real types if they exist in the project
// import type { User } from '@/types';

export interface MockItem {
  id: string;
  name: string;
  // ... fields
}

export const mockData: MockItem[] = [
  {
    id: '1',
    name: 'Example',
  },
];
```

## Code Conventions

### React Patterns
- Use `'use client'` directive for interactive prototypes
- `useState`, `useEffect` for state — no external state libraries in prototypes
- Props use `interface`, not `type`

### Components (Constrained Mode)
- Import from project's component path (usually `@/components/ui/`)
- Check component files for variant props (e.g., `variant="outline"`, `size="sm"`)
- Use `cn()` from the project's utils for conditional classes

### Components (Creative Mode)
- Build with raw HTML + Tailwind classes
- Use project's design tokens for colors: `bg-primary`, `text-muted-foreground`, `border-border`
- Can use Tailwind animations: `animate-pulse`, `animate-spin`, `transition-all`
- Inline SVGs for icons when icon library not available

### Icons
- `lucide-react`: `import { Phone, Mail } from 'lucide-react'`
- If no icon library: use emoji or inline SVG

## Dev Server

- URL: `http://localhost:3000` (default)
- Start: `pnpm dev` or `pnpm --filter {app-name} dev` (monorepo)
- HMR: Fast Refresh picks up changes automatically
- Preview path: `/exp/{prototype-name}`
