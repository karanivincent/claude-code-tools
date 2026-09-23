/**
 * GET <version route>: the commit this build serves (delivery-tools, spec 6.2 item 3 and M15).
 * Copied from the delivery-tools plugin's templates/ to the path the profile names as
 * paths.versionRoute (a Next.js App Router route handler, for example app/api/version/route.ts).
 *
 * Every capture checks it before trusting a page: a capture of the wrong build is refused. On a
 * hosted preview the platform's commit variable answers; a local dev or production server started
 * by a capture gets BUILD_SHA from the capture's webServer.
 */
export const dynamic = 'force-dynamic';

const SHA_VARIABLES = ['VERCEL_GIT_COMMIT_SHA', 'BUILD_SHA', 'GIT_COMMIT_SHA', 'COMMIT_SHA', 'SOURCE_VERSION'] as const;

export function GET(): Response {
  let sha: string | null = null;
  for (const name of SHA_VARIABLES) {
    const value = process.env[name];
    if (value && /^[0-9a-f]{7,40}$/i.test(value)) {
      sha = value.toLowerCase();
      break;
    }
  }
  return Response.json({ sha }, { headers: { 'cache-control': 'no-store' } });
}
