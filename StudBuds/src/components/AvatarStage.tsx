import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, Center, Html, OrbitControls } from '@react-three/drei';
import { Penguin } from './Penguin.tsx';

/** If the model fails to load, show a message instead of taking down the whole auth page */
class StageErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function AvatarStage() {
  return (
    <StageErrorBoundary
      fallback={<p className="m-auto text-center opacity-60">The 3D penguin couldn’t load.</p>}
    >
      <Canvas
        camera={{ position: [0, 1, 5], fov: 40 }}
        dpr={[1, 2]}
        className="cursor-grab active:cursor-grabbing"
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <directionalLight position={[-4, 2, -3]} intensity={0.4} />

        <Suspense
          fallback={
            <Html center>
              <p className="whitespace-nowrap opacity-60">Loading penguin…</p>
            </Html>
          }
        >
          {/* Bounds frames the camera around the model, whatever size it was exported at */}
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <Penguin />
            </Center>
          </Bounds>
        </Suspense>

        {/* Drag to spin. No zoom or pan, and it can't be flipped upside down. */}
        {/* <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={1.5}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.8}
        /> */}
      </Canvas>
    </StageErrorBoundary>
  );
}