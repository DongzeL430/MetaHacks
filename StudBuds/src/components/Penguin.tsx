/*
 * Typed version of the gltfjsx output (npx gltfjsx@6.5.3 penguinglb.glb).
 * The .glb file has to be in /public so it's served at /penguinglb.glb.
 */
import { useGLTF } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import type { Material, Mesh } from 'three';

const MODEL_URL = '/penguinglb.glb';

/** The parts of the file this component uses */
interface PenguinGLTF {
  nodes: { Box001: Mesh };
  materials: { '02 - Default': Material };
}

export function Penguin(props: ThreeElements['group']) {
  const { nodes, materials } = useGLTF(MODEL_URL) as unknown as PenguinGLTF;

  return (
    <group {...props} dispose={null}>
      <mesh
        geometry={nodes.Box001.geometry}
        material={materials['02 - Default']}
        position={[0, 0.23, 0]}
        scale={0.0025}
      />
    </group>
  );
}

// Start downloading as soon as this file is imported, before the canvas mounts
useGLTF.preload(MODEL_URL);