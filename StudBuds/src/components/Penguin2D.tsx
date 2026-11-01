import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeElements } from '@react-three/fiber';
import { DoubleSide, Shape } from 'three';
import type { Group } from 'three';

/*
 * A flat, hand-drawn style penguin built from simple shapes, drawn facing right.
 * Everything animates in useFrame, so toggling `walking` never rebuilds the model.
 *
 * Drawing units: feet on y = 0, top of the head at about y = 1.5.
 * The `height` prop scales that to world units.
 */

const COLORS = {
  ink: '#2b2b2b', // outlines
  body: '#34404c',
  flipper: '#29323b',
  belly: '#FDF7F1',
  beak: '#F2A65A',
  frontFoot: '#F2A65A',
  backFoot: '#D98C45',
  eye: '#FFFFFF',
  pupil: '#1f1f1f',
  blush: '#F2A99E',
};

const OUTLINE = 0.045;
const DESIGN_HEIGHT = 1.5;

/** Full walk cycles (two steps) per second at speed 1 */
const CYCLES_PER_SECOND = 1.6;

interface BlobProps {
  x?: number;
  y?: number;
  z?: number;
  rx: number;
  ry: number;
  color: string;
  outline?: boolean;
}

/** An ellipse with an optional ink outline drawn just behind it */
function Blob({ x = 0, y = 0, z = 0, rx, ry, color, outline = true }: BlobProps) {
  return (
    <group position={[x, y, z]}>
      {outline && (
        <mesh position={[0, 0, -0.005]} scale={[rx + OUTLINE, ry + OUTLINE, 1]}>
          <circleGeometry args={[1, 40]} />
          <meshBasicMaterial color={COLORS.ink} side={DoubleSide} toneMapped={false} />
        </mesh>
      )}
      <mesh scale={[rx, ry, 1]}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial color={color} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Pointed beak shape, base at x = 0, tip pointing right */
function beakShape(halfBase: number, length: number) {
  const s = new Shape();
  s.moveTo(0, halfBase);
  s.quadraticCurveTo(length * 0.6, halfBase * 0.45, length, 0);
  s.quadraticCurveTo(length * 0.6, -halfBase * 0.45, 0, -halfBase);
  s.closePath();
  return s;
}

/** A foot, with its pivot at the heel so lifting tips the toes up */
function Foot({ color }: { color: string }) {
  return <Blob x={0.06} y={0.065} rx={0.17} ry={0.065} color={color} />;
}

export type Penguin2DProps = Omit<ThreeElements['group'], 'scale'> & {
  /** Walk cycle on/off. Blends smoothly between walking and standing. */
  walking?: boolean;
  /** 1 faces right, -1 faces left. Turning is animated. */
  facing?: 1 | -1;
  /** Animation speed multiplier */
  speed?: number;
  /** Height in world units */
  height?: number;
};

export function Penguin2D({ walking = false, facing = 1, speed = 1, height = 1.6, ...groupProps }: Penguin2DProps) {
  const flip = useRef<Group>(null);
  const body = useRef<Group>(null);
  const flipper = useRef<Group>(null);
  const frontFoot = useRef<Group>(null);
  const backFoot = useRef<Group>(null);
  const anim = useRef({ phase: 0, walk: 0, time: 0 });

  const beak = useMemo(() => beakShape(0.07, 0.26), []);
  const beakOutline = useMemo(() => beakShape(0.11, 0.33), []);

  useFrame((_, delta) => {
    const a = anim.current;
    const dt = Math.min(delta, 0.05); // no huge jumps after a hidden tab comes back
    a.time += dt;
    a.phase += dt * Math.PI * 2 * CYCLES_PER_SECOND * speed;
    a.walk += ((walking ? 1 : 0) - a.walk) * Math.min(1, dt * 8); // 0 = standing, 1 = walking

    const w = a.walk;
    const s = Math.sin(a.phase);
    const c = Math.cos(a.phase);
    const breath = Math.sin(a.time * 2.2);

    // Turn around by squashing through zero width, like flipping a paper cutout
    if (flip.current) {
      const sx = flip.current.scale.x;
      flip.current.scale.x = sx + (facing - sx) * Math.min(1, dt * 12);
    }

    // Body: bob up when a foot passes under it, waddle side to side; gentle breathing when still
    if (body.current) {
      body.current.position.y = w * 0.04 * Math.abs(c) + (1 - w) * 0.008 * breath;
      body.current.rotation.z = w * 0.09 * s;
    }

    // Flipper swings opposite the near foot
    if (flipper.current) {
      flipper.current.rotation.z = -0.15 + w * 0.28 * s + (1 - w) * 0.03 * breath;
    }

    // Feet: each moves forward while lifted, back while planted
    if (frontFoot.current) {
      const lift = w * 0.07 * Math.max(0, c);
      frontFoot.current.position.x = 0.1 + w * 0.13 * s;
      frontFoot.current.position.y = lift;
      frontFoot.current.rotation.z = lift * 1.5;
    }
    if (backFoot.current) {
      const lift = w * 0.07 * Math.max(0, -c);
      backFoot.current.position.x = -0.08 - w * 0.13 * s;
      backFoot.current.position.y = lift;
      backFoot.current.rotation.z = lift * 1.5;
    }
  });

  return (
    <group {...groupProps} scale={height / DESIGN_HEIGHT}>
      <group ref={flip}>
        {/* Far foot, behind everything */}
        <group ref={backFoot} position={[-0.08, 0, -0.05]}>
          <Foot color={COLORS.backFoot} />
        </group>

        {/* Body pivots at the feet, so the waddle rocks from the ground up */}
        <group ref={body}>
          <Blob y={0.78} rx={0.5} ry={0.72} color={COLORS.body} />
          <Blob x={0.12} y={0.62} z={0.01} rx={0.32} ry={0.5} color={COLORS.belly} outline={false} />

          {/* Face */}
          <Blob x={0.2} y={1.22} z={0.02} rx={0.09} ry={0.1} color={COLORS.eye} outline={false} />
          <Blob x={0.24} y={1.21} z={0.03} rx={0.045} ry={0.055} color={COLORS.pupil} outline={false} />
          <Blob x={0.3} y={1.03} z={0.02} rx={0.06} ry={0.035} color={COLORS.blush} outline={false} />
          <group position={[0.38, 1.11, 0.02]}>
            <mesh position={[-0.02, 0, -0.005]}>
              <shapeGeometry args={[beakOutline]} />
              <meshBasicMaterial color={COLORS.ink} side={DoubleSide} toneMapped={false} />
            </mesh>
            <mesh position={[0.02, 0, 0]}>
              <shapeGeometry args={[beak]} />
              <meshBasicMaterial color={COLORS.beak} side={DoubleSide} toneMapped={false} />
            </mesh>
          </group>

          {/* Near flipper, pivoting at the shoulder */}
          <group ref={flipper} position={[-0.02, 1.0, 0.04]}>
            <Blob y={-0.28} rx={0.11} ry={0.3} color={COLORS.flipper} />
          </group>
        </group>

        {/* Near foot, in front of the body */}
        <group ref={frontFoot} position={[0.1, 0, 0.05]}>
          <Foot color={COLORS.frontFoot} />
        </group>
      </group>
    </group>
  );
}