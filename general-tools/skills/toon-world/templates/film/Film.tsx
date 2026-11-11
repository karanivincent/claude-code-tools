import React, { useEffect } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { Stage, Take, Relight, useLoaded, loadPlace } from './Stage';
import { Card, Paper, Thought, Captions, cuesOf } from './overlays';
import { SEGS, CARDS, PAPERS, THOUGHTS, CAPTIONS, DURATION } from './shots';
import { STORY } from './story';
import { segAt, frameAt, checkSegs, checkPace, checkJoins, intoOf } from '../../toon-kit/timing';

// The film: the board's places and shots played in time with the voice (shots.ts). One place is on screen at a time;
// its canvas is keyed by the place, so a new place builds once and then runs for its frames, and the next place loads
// while this one plays. Joins (decision 4): a swing inside a place by default; a hard cut between places, or for a
// change of time, each with its reason (`why`), at most 3 plus the loop (toon-kit checkJoins). No whip pans: they need
// motion blur, which is banned (decision 6). Cards, papers, thought bubbles and the running captions are drawn over the
// picture.
// Props: audio (the mix, '' for a silent render), debug ('audit' logs one sample a frame for tools/audit.mjs, 'nopost'
// skips the look stack), at (a fixed time in seconds, for stills).

let auditCfgSent = false;
/** the film's cues, picture events and segment problems for the acting audit, logged once */
function logAuditConfig() {
  if (auditCfgSent) return; auditCfgSent = true;
  const { slug, audio, mustSee, subjects, skyPlanned, framed, pauses, reference, acknowledged, named } = STORY;
  console.log('AUDITCFG ' + JSON.stringify({ events: STORY.events(SEGS), cues: cuesOf(CARDS, PAPERS, THOUGHTS), captions: CAPTIONS, segs: [...checkSegs(SEGS), ...checkPace(SEGS, DURATION), ...checkJoins(SEGS)],
    plan: SEGS.map((x, i) => ({ place: x.place, shot: x.shot, a: x.a, b: x.b, into: intoOf(SEGS, i) })), duration: DURATION,
    story: { slug, audio, mustSee, subjects, skyPlanned, framed, pauses, reference, acknowledged, named: [...named] } }));
}

export const Film: React.FC<{ at?: number; debug?: string; audio?: string; relight?: Relight }> = ({ at, debug = '', audio = STORY.audio, relight }) => {
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = at ?? frame / fps;
  if (debug.includes('audit') || debug.includes('look')) logAuditConfig();
  const i = segAt(SEGS, t), s = SEGS[i], next = SEGS[i + 1];
  const r = useLoaded(s.place);
  useEffect(() => { if (next && next.place !== s.place) loadPlace(next.place).catch(() => undefined); }, [next, s.place]);

  const take: Take = { people: s.act ? (base) => s.act!(t, base) : undefined, blur: s.blur, relight };
  const k = width / 1080;
  return (
    <AbsoluteFill style={{ backgroundColor: STORY.background }}>
      {r && <AbsoluteFill>
        <ThreeCanvas key={s.place} width={width} height={height} shadows gl={{ antialias: false, stencil: false, powerPreference: 'high-performance' }} camera={{ fov: 40, near: 0.05, far: 3000 }}>
          <Stage def={r.def} a={r.a} shot={s.shot} debug={debug} filmT={t} take={take} place={s.place} seg={i}
            frameView={(_view, other, shotT) => { const f = frameAt(SEGS, t, other, () => shotT); return { view: f.view, t: f.clock }; }} />
        </ThreeCanvas>
      </AbsoluteFill>}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        {/* debug 'clean': no overlays, for thumbnail frames (tools/render.mjs FILM_DEBUG=clean) */}
        {!debug.includes('clean') && THOUGHTS.filter(h => t >= h.a && t < h.b).map(h => <Thought key={h.img + h.a} h={h} t={t} />)}
        {!debug.includes('clean') && PAPERS.filter(p => t >= p.a && t < p.b).map(p => <Paper key={p.title + p.a} p={p} t={t} />)}
        {!debug.includes('clean') && CARDS.filter(c => t >= c.a && t < c.b).map(c => <Card key={c.text + c.a} c={c} t={t} />)}
        {!debug.includes('clean') && <Captions captions={CAPTIONS} t={t} />}
      </div>
      {audio && at === undefined && <Audio src={staticFile(audio)} />}
    </AbsoluteFill>
  );
};
export default Film;
