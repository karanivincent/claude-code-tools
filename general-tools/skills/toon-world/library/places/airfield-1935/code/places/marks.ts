// b17-checklist: where things stand in each place, shared by the place files (the world stage) and the scenes (the shots
// stage and the scene builders). No three.js here: the scene tools load it in node.
export type V3 = [number, number, number];
export type Box = { name: string; min: V3; max: V3 };

/** Wright Field (metres). The runway runs along x, z from -15 to 15. The apron, hangar and officers' stand are north
 *  of it (-z); the crash site is east (+x) and just south of the runway (+z). */
export const AIRFIELD = {
  hangar: [-130, 0, -95] as V3, // its door faces +z, front wall at z = -75
  stand: [-30, 0, -48] as V3, // three tiers rising to -z, front at z = -47.4, facing the runway
  windSock: [-70, 0, -26] as V3,
  fireTruckHome: [-108, 0, -68] as V3, ambulanceHome: [-100, 0, -70] as V3,
  /** the rescue (world-r3): set where s05's cameras look, left and right of the burning engine, side-on to the lens */
  fireTruckCrash: [94.7, 0, 11.3] as V3, ambulanceCrash: [105.3, 0, 15.6] as V3, rescueYaw: -0.8,
  firemenAt: [[91.5, 0, 15.2], [93.4, 0, 14.4], [89.8, 0, 14.0]] as V3[],
  /** the officers on the stand (soles): the general, the colonel, the lieutenant; the Boeing man at its foot */
  general: [-31.3, 1.1, -49.2] as V3, colonel: [-30.1, 1.7, -50.4] as V3, lieutenant: [-32.4, 1.7, -50.4] as V3, boeing: [-25.5, 0, -46.2] as V3,
  /** the mechanic by the parked plane's nose, and the checklist pilot's spot in s10 */
  mechanic: [-86.5, 0, -35.5] as V3, pilotEnd: [-83.6, 0, -36.2] as V3,
  /** the caps on the grass by the wreck (s05, "both died") */
  caps: [[77.6, 0.05, 33.4], [78.7, 0.05, 32.9]] as V3[],
  /** the firemen running to the wreck (s05) */
  fireman1: [88, 0, 36] as V3, fireman2: [92, 0, 38] as V3,
};
/** the wind (x, z per second of drift, normalised to about 1): toward -x, a little north. The plane takes off into it;
 *  the wind sock, the flag, the smoke columns and the clouds all lean or drift this way. From the s04 and s05 cameras
 *  (looking north-east) the smoke leans screen left. */
export const WIND: [number, number] = [-0.86, -0.5];
/** the engine thrown clear of the wreck, burning (in the middle of s05's last shot, behind the helmets) */
export const THROWN: V3 = [90.5, 0, 21];
/** ground crew far off on the field (place detail, not the cast): two on the north side behind the takeoff run (s04's
 *  opening), three south-east in front of s04's last framing; they run to the smoke after the impact */
export const CREW: { at: V3; suit: string }[] = [
  { at: [-74, 0, -31], suit: '#4f6a8a' }, { at: [-66, 0, -34], suit: '#8a6a3a' },
  { at: [56, 0, 62], suit: '#4f6a8a' }, { at: [50, 0, 66], suit: '#5d7a44' }, { at: [62, 0, 59], suit: '#8a6a3a' },
];
/** world-r5: the tree line (and a hedge) across s04's view of the crash: 70 % of the way from s04's last camera to the
 *  impact, square to that sight line, 60 m long; the plane's last 8 m of fall and the impact's foot are behind it */
export const TREELINE = { ends: [[51.1, 25.7], [92.5, 68.9]] as [number, number][], n: 16 };
/** the cockpit (metres): the floor at y 0, the nose (+x) ahead; Hill in the left seat (-z), Tower standing behind */
export const COCKPIT = { hill: [0, 0.32, -0.42] as V3, tower: [-1.15, 0, 0.12] as V3, clipboard: [-0.25, 1.22, -0.8] as V3, glass: 1.25 };
/** the hangar (metres): the door at z = 20 opens on the field; the table under the lamp in the middle */
export const HANGAR = {
  table: [0, 0, 2] as V3, boeing: [3.2, 0, 7.5] as V3,
  pilotA: [-1.1, 0, 0.8] as V3, pilotB: [1.2, 0, 1.0] as V3, pilotC: [0.1, 0, -0.4] as V3,
  /** the smaller twin-engine plane taxis past the door, outside, along x (s06) */
  smallPlaneZ: 46,
};
/** above the clouds: the formation flies along +x at y 0; the cloud floor is about 60 m below */
export const SKY = { floor: -60 };

/** Each place's far picture: the way it faces (x, z) and its arc in radians. tools/shots-check.mjs checks every shot looks
 *  into it (S5-72). The airfield and the cockpit carry the picture as one full ring (three copies, alternate ones
 *  mirrored), so every way is covered; shots-check's edge test still flags a look near 180 degrees off `toward`, which
 *  for a full ring is no edge. Cameras that look up past the picture's top see the sky clouds (airfield.ts CLOUDS). */
export const FAR: Record<string, { toward: [number, number]; arc: number }> = {
  airfield: { toward: [0, 1], arc: Math.PI * 2 },
  cockpit: { toward: [1, 0], arc: Math.PI * 2 }, // cockpit.ts builds the airfield picture as a full ring round the glass
  hangar: { toward: [0, 1], arc: Math.PI },
  sky: { toward: [0, -1], arc: Math.PI * 2 },
};
/** Solid things that can hide a person (world boxes) for tools/path-check.mjs (S5-80) */
export const BLOCKERS: Record<string, Box[]> = {
  airfield: [
    { name: 'hangar', min: [-151, 0, -115], max: [-109, 18, -75] },
    { name: 'wreck (burning middle)', min: [84, 0, 17], max: [108, 4, 37] },
    { name: 'thrown engine', min: [86, 0, 18], max: [94, 2, 24] },
    { name: 'fire truck at the wreck', min: [91, 0, 7.5], max: [99, 3.2, 15.5] },
    { name: 'ambulance at the wreck', min: [102, 0, 12.5], max: [108.5, 2.6, 18.5] },
    { name: 'officers stand', min: [-40, 0, -52], max: [-20, 4.4, -47] },
    { name: 'tree line (middle of it)', min: [62, 0, 38], max: [82, 7, 57] },
  ],
  cockpit: [{ name: 'instrument panel', min: [0.75, 0, -1.0], max: [1.0, 1.15, 1.0] }],
  hangar: [{ name: 'table', min: [-1.2, 0, 1.2], max: [1.2, 0.85, 2.8] }],
  sky: [],
};
/** Screen direction per place (S5-79) */
export const SCREEN: Record<string, string> = {
  airfield: 'the takeoff is filmed from the south (+z) looking north: the plane runs screen right (+x); the stand and hangars sit behind it. The hook and s02 film the apron from the east and south-east. s04 and s05 look north-east (+x, -z) at the crash site: the wreck and fire truck ahead, the thrown engine burning behind the helmets, the smoke leaning screen left with the wind (WIND), the water tower and the far hangars of the picture behind.',
  cockpit: 'cameras face the pilots from the nose (looking -x), or over their shoulders out of the glass (looking +x): Hill is screen left from behind, screen right from the front',
  hangar: 'cameras inside look toward the door (+z) or across the table; the field and the passing plane are seen through the door',
  sky: 'the formation flies screen right (+x), filmed from its south side (+z looking -z)',
};
