# Detection Patterns

Regex patterns for automated issue detection. Use these before AI review for high-confidence issues.

## Blocker Patterns

### Console Statements
```
Pattern: console\.(log|warn|error|info|debug)\(
Confidence: 0.95
Example: console.log('Creating class:', formData);
Fix: Remove before merging
```

### Debugger Statements
```
Pattern: \bdebugger\b
Confidence: 0.99
Example: debugger;
Fix: Remove before merging
```

### Hardcoded API Keys
```
Pattern: ['"]sk-[a-zA-Z0-9]{20,}['"]
Confidence: 0.99
Example: const apiKey = 'sk-abc123def456ghi789jkl012mno345';
Fix: Move to environment variable (.env.secret)
```

### Hardcoded Secrets
```
Pattern: (api[_-]?key|secret|password|token|credential)\s*[:=]\s*['"][^'"]{8,}['"]
Confidence: 0.95
Note: Case-insensitive, ignore type definitions
Example: const API_KEY = 'my-secret-key-12345';
Fix: Move to environment variable (.env.secret)
```

### Database Connection Strings
```
Pattern: (mongodb|postgres|mysql|redis)://[^'"]+:[^'"]+@
Confidence: 0.99
Example: const dbUrl = 'postgres://user:password@localhost:5432/db';
Fix: Use environment variable for connection string
```

## Major Patterns

### $root/src/lib Import
```
Pattern: from ['"]\\$root/src/lib
Confidence: 0.95
Example: import { getApiClient } from '$root/src/lib/api/axios';
Fix: import { getApiClient } from '$lib/api/axios';
```

### Explicit any Type
```
Pattern: :\s*any(?:\s|[,)\]>]|$)
Confidence: 0.90
Example: const data: any = response;
Fix: Define proper interface or type
```

### as any Cast
```
Pattern: as\s+any\b
Confidence: 0.90
Example: const result = value as any;
Fix: Use proper type or type guard
```

### $$props.class Unsafe Access
```
Pattern: \$\$props\.class[^?]
Confidence: 0.85
Example: class={$$props.class}
Fix: class={$$props.class ?? ''}
```

### JSON.parse Without Try/Catch
```
Pattern: JSON\.parse\([^)]+\)(?![^;]*catch)
Confidence: 0.80
Note: Check surrounding context for try/catch block
Example: const data = JSON.parse(response);
Fix: Wrap in try/catch or use safeJsonParse utility
```

### JSON.stringify Without Try/Catch
```
Pattern: JSON\.stringify\([^)]+\)(?![^;]*catch)
Confidence: 0.75
Note: Less critical than parse, but can throw on circular references
Example: localStorage.setItem('key', JSON.stringify(data));
Fix: Use safeJsonStringify utility if available
```

### localStorage/sessionStorage Access
```
Pattern: (localStorage|sessionStorage)\.(get|set)Item
Confidence: 0.70
Note: Can throw in private browsing mode
Example: const value = localStorage.getItem('token');
Fix: Wrap in try/catch for private browsing compatibility
```

### Loss of Type Safety (String Instead of Enum)
```
Pattern: !== ['"][A-Z_]+['"]|=== ['"][A-Z_]+['"]
Confidence: 0.75
Note: Requires context - check if enum exists
Example: booking.status !== 'DECLINED'
Fix: booking.status !== AppointmentStatus.DECLINED
```

## Minor Patterns

### Deep Relative Import
```
Pattern: from ['"]\\.\\.(/\\.\\.){2,}
Confidence: 0.90
Example: import { utils } from '../../../../lib/utils';
Fix: import { utils } from '$lib/utils';
```

### Or Fallback Instead of Nullish
```
Pattern: \|\|\s*(?:['"](['"])|\[\]|0|false)
Confidence: 0.75
Example: const name = value || '';
Fix: const name = value ?? '';
Note: || treats 0, '', false as falsy; ?? only null/undefined
```

### Redundant Nullish Coalescing
```
Pattern: (\w+)\s*\?\?\s*\1
Confidence: 0.95
Example: $formData.start_ts ?? $formData.start_ts
Fix: Remove redundant check
```

### Multiple Equality Checks
```
Pattern: ===\s*['"][^'"]+['"]\s*\|\|\s*\w+\s*===\s*['"]
Confidence: 0.80
Example: status === 'ACTIVE' || status === 'PENDING'
Fix: ['ACTIVE', 'PENDING'].includes(status)
```

## Suggestion Patterns

### Undefined Assignment
```
Pattern: =\s*undefined(?!\s*as)
Confidence: 0.70
Example: let value = undefined;
Fix: let value = null;
Note: Project convention prefers null for explicit absent values
```

### Hardcoded Color
```
Pattern: ['"]#[0-9A-Fa-f]{6}['"]
Confidence: 0.60
Note: Check if color constant exists
Example: color ?? '#3B82F6'
Fix: color ?? DEFAULT_COLOR_VALUE
```

### Magic Number
```
Pattern: (?<![.\d])\d{3,}(?![.\d])
Confidence: 0.50
Note: Context matters - ignore line numbers, timeouts, etc.
Example: return 150;
Fix: return MAX_ITEMS;
```

## Testability Patterns

### Store Access in Logic Function
```
Pattern: (import.*Store|from.*store).*\n.*export (function|const)
Confidence: 0.70
Note: Function imports store AND exports logic - check if store is used for decisions
Example:
  import { userStore } from '$lib/stores';
  export function calculateDiscount(price: number) {
    const user = get(userStore);
    if (user.membershipLevel === 'GOLD') return price * 0.8;
  }
Fix: Extract pure logic, pass values as parameters
```

### Mixed Fetch and Transform
```
Pattern: await.*\.(get|post|fetch).*\n.*\.(map|filter|reduce)\(
Confidence: 0.70
Note: Same function has API call AND array transformation
Example:
  const data = await api.getBookings();
  return data.filter(b => b.status === 'ACTIVE').map(formatBooking);
Fix: Split into fetcher + pure transformer
```

### Multiple Await in Function
```
Pattern: await.*\n.*await
Confidence: 0.60
Note: Multiple side effects in one function - may need splitting
Example:
  await api.save(data);
  await notificationStore.success('Saved');
  await goto('/success');
Fix: Consider splitting into smaller single-purpose functions
```

## Test Coverage Patterns

### New Route Without E2E
```
Pattern: \+page\.(svelte|ts)
Confidence: 0.85
Note: Check if route has forms (<form, use:enhance, createMutation)
      Then search e2e/**/*.spec.ts for coverage
Example: src/routes/app/classes/[id]/+page.svelte (new file)
Fix: Add E2E test in e2e/staff_user/ or e2e/customer_user/
```

### New Utility Without Test
```
Pattern: export (function|const \w+ =).*\{
Confidence: 0.80
Note: In utils/, lib/, services/, models/ - check for {file}.test.ts
Example: export function getInitials(name: string) { ... }
Fix: Add colocated test file with edge cases
```

### New Component Without Story
```
Pattern: (atoms|molecules)/.*\.svelte$|packages/ui/.*\.svelte$
Confidence: 0.75
Note: Check for {Component}.stories.svelte
Example: src/lib/components/atoms/BackButton.svelte (new file)
Fix: Add colocated story file
```
