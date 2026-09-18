// A synthetic app in two states, the twin of a redesign that silently dropped capabilities: the
// base has a Sandbox tab posting channel=sms, a helper box that asks for a generated widget, and a
// detail page showing the widget's slug; the head retires the tab, drops the generate step and the
// slug, and rewrites the e2e test that asserted the generate step (title and assertions both).

export const TSCONFIG = JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }, null, 2);

export const BASE = {
  'apps/web/tsconfig.json': TSCONFIG,
  'apps/web/src/app/[locale]/widgets/page.tsx': `import { WidgetList } from '@/components/widgets/widget-list';
export default function Page() { return <WidgetList />; }
`,
  'apps/web/src/app/[locale]/widgets/[id]/page.tsx': `import { WidgetDetail } from '@/components/widgets/widget-detail';
export default async function Page({ params }) { const { id } = await params; return <WidgetDetail id={id} />; }
`,
  'apps/web/src/app/[locale]/settings/page.tsx': `export default function Settings() { return <p>Settings</p>; }
`,
  'apps/web/src/components/widgets/widget-list.tsx': `'use client';
import { useTranslations } from 'next-intl';
export function WidgetList() {
  const t = useTranslations('widgets');
  const load = () => fetch('/api/widgets');
  return <h1>{t('list.title')}</h1>;
}
`,
  'apps/web/src/components/widgets/widget-detail.tsx': `'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SandboxTab } from './sandbox-tab';
import { HelperBox } from './helper-box';

async function fetchWidget(id: string) {
  const response = await fetch(\`/api/widgets/\${id}\`);
  return response.json();
}

export function WidgetDetail({ id }: { id: string }) {
  const t = useTranslations('widgets');
  const [tab, setTab] = useState('overview');
  const data = useWidget(id);
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
        <TabsTrigger value="sandbox">{t('tabs.sandbox')}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <dt>{t('detail.slug')}</dt>
        <dd>{data.slug}</dd>
        <p>{data.name} isn't {t(\`state.\${data.state === 'on' ? 'on' : 'off'}\`)}</p>
        <HelperBox id={id} />
      </TabsContent>
      <TabsContent value="sandbox"><SandboxTab id={id} /></TabsContent>
    </Tabs>
  );
}
`,
  'apps/web/src/components/ui/tabs.tsx': `export function Tabs(p) { return p.children; }
export const TabsList = Tabs; export const TabsTrigger = Tabs; export const TabsContent = Tabs;
`,
  'apps/web/src/components/widgets/sandbox-tab.tsx': `'use client';
import { useState } from 'react';
const MODE_FOR = { voice: 'loopback', sms: 'loopback', phone: 'to_phone' } as const;
export function SandboxTab({ id }: { id: string }) {
  const [choice, setChoice] = useState<'voice' | 'sms' | 'phone'>('voice');
  const mode = MODE_FOR[choice];
  const channel = choice === 'sms' ? 'sms' : 'voice';
  const start = () => fetch(\`/api/widgets/\${id}/runs\`, {
    method: 'POST',
    body: JSON.stringify({ mode, channel, times: 1 }),
  });
  return <button data-testid="channel-sms" onClick={() => setChoice('sms')}>SMS</button>;
}
`,
  'apps/web/src/components/widgets/helper-box.tsx': `'use client';
type GenerateBody = { step: 'generate'; description: string };
type RefineBody = { step: 'refine'; instruction: string };
type HelperBody = GenerateBody | RefineBody;
export function HelperBox({ id }: { id: string }) {
  const helper = useMutation({
    mutationFn: async (body: HelperBody) => {
      const response = await fetch(\`/api/widgets/\${id}/helper\`, { method: 'POST', body: JSON.stringify(body) });
      return response.json();
    },
  });
  return (
    <div data-testid="helper-box">
      <button data-testid="helper-generate" onClick={() => helper.mutate({ step: 'generate', description: 'x' })}>Generate</button>
    </div>
  );
}
`,
  'apps/web/src/app/api/widgets/route.ts': `export async function GET() { return db.from('widgets').select('id, name'); }
`,
  'apps/web/src/app/api/widgets/[id]/route.ts': `const COLUMNS = 'id, name, slug, ' + 'state';
export async function GET() { return db.from('widgets').select(COLUMNS).eq('id', 'x').single(); }
`,
  'apps/web/src/app/api/widgets/[id]/runs/route.ts': `export async function POST() { return new Response(null); }
`,
  'apps/web/src/app/api/widgets/[id]/helper/route.ts': `export async function POST() { return new Response(null); }
`,
  'apps/web/e2e/widget-helper.spec.ts': `import { test, expect } from '@playwright/test';
test.describe('helper', () => {
  test('generating a widget spends one credit', async ({ page }) => {
    await page.goto(\`/en/widgets/\${id}\`);
    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.getByTestId('helper-generate').click();
    expect(row).toMatchObject({ step: 'generate', owner: 'someone' });
  });
  test('the box opens beside the widget', async ({ page }) => {
    await page.goto(\`/en/widgets/\${id}\`);
    await expect(page.getByTestId('helper-box')).toBeVisible();
  });
});
`,
  'apps/web/e2e/settings.spec.ts': `import { test } from '@playwright/test';
test('settings open', async ({ page }) => { await page.goto('/en/settings'); await page.getByTestId('settings').click(); });
`,
};

export const HEAD = {
  ...BASE,
  'apps/web/src/components/widgets/widget-detail.tsx': `'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrialTab } from './trial-tab';
import { HelperBox } from './helper-box';

export function WidgetDetail({ id }: { id: string }) {
  const t = useTranslations('widgets');
  const data = useWidget(id);
  const load = () => fetch(\`/api/widgets/\${id}\`);
  return (
    <Tabs>
      <TabsList>
        <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
        <TabsTrigger value="trial">{t('tabs.trial')}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview"><p>{data.name}</p><HelperBox id={id} /></TabsContent>
      <TabsContent value="trial"><TrialTab id={id} /></TabsContent>
    </Tabs>
  );
}
`,
  'apps/web/src/components/widgets/sandbox-tab.tsx': null,
  'apps/web/src/components/widgets/trial-tab.tsx': `'use client';
export function TrialTab({ id }: { id: string }) {
  const [mode] = useState<'loopback' | 'to_phone'>('loopback');
  const start = () => fetch(\`/api/widgets/\${id}/runs\`, { method: 'POST', body: JSON.stringify({ mode }) });
  return <section data-testid="trial-tab"><button>Start</button></section>;
}
`,
  'apps/web/src/components/widgets/helper-box.tsx': `'use client';
type RefineBody = { step: 'refine'; instruction: string };
export function HelperBox({ id }: { id: string }) {
  const helper = useMutation({ mutationFn: (body: RefineBody) => fetch(\`/api/widgets/\${id}/helper\`, { method: 'POST', body: JSON.stringify(body) }) });
  return <div data-testid="helper-box"><button data-testid="helper-rewrite" onClick={() => helper.mutate({ step: 'refine', instruction: 'x' })}>Rewrite</button></div>;
}
`,
  'apps/web/e2e/widget-helper.spec.ts': `import { test, expect } from '@playwright/test';
test.describe('helper', () => {
  test('rewriting a widget spends one credit', async ({ page }) => {
    await page.goto(\`/en/widgets/\${id}\`);
    await page.getByTestId('helper-rewrite').click();
    expect(row).toMatchObject({ step: 'refine' });
  });
  test('the box opens beside the widget', async ({ page }) => {
    await page.goto(\`/en/widgets/\${id}\`);
    await expect(page.getByTestId('helper-box')).toBeVisible();
  });
});
`,
};

export const INTENT_SCOPE = [
  { screen: 'Widgets list', routes: ['/widgets'] },
  { screen: 'Widget', routes: ['/widgets/[id]'] },
];
