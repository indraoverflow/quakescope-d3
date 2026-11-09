import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import Globe from "r3f-globe";
import {
  Vector3,
  Quaternion,
  InstancedMesh,
  Object3D,
  Color,
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
} from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import { depthColor, markerSize, position, type Event } from "./earthquake";
import { useExplorer } from "./store";
import { loadBoundaries, type BoundaryPath } from "./tectonics";
function Camera() {
  const controls = useRef<Controls>(null);
  const { camera } = useThree();
  const selected = useExplorer((s) => s.selected),
    reset = useExplorer((s) => s.reset),
    auto = useExplorer((s) => s.autoRotate);
  const target = useRef<Vector3 | null>(null);
  const idle = useRef(0);
  const interacting = useRef(false);
  const rotation = useRef(new Quaternion());
  const direction = useRef(new Vector3());
  const current = useRef(new Vector3());
  const step = useRef(new Quaternion());
  useEffect(() => {
    target.current = new Vector3(
      ...position(selected?.latitude ?? -5, selected?.longitude ?? 118),
    ).multiplyScalar(selected ? 2.35 : 2.8);
  }, [selected, reset]);
  useFrame((_, dt) => {
    if (target.current) {
      const alpha = 1 - Math.exp(-dt * 3);
      const radius = camera.position.length();
      direction.current.copy(target.current).normalize();
      current.current.copy(camera.position).normalize();
      step.current.setFromUnitVectors(current.current, direction.current);
      rotation.current.identity().slerp(step.current, alpha);
      camera.position
        .applyQuaternion(rotation.current)
        .setLength(radius + (target.current.length() - radius) * alpha);
      if (camera.position.distanceTo(target.current) < 0.1)
        target.current = null;
    }
    if (controls.current)
      controls.current.autoRotate =
        auto &&
        !interacting.current &&
        !target.current &&
        Date.now() > idle.current;
  });
  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minDistance={120}
      maxDistance={470}
      autoRotateSpeed={0.22}
      enableDamping
      onStart={() => {
        interacting.current = true;
        target.current = null;
      }}
      onEnd={() => {
        interacting.current = false;
        idle.current = Date.now() + 4000;
      }}
    />
  );
}
function Halos({ events }: { events: Event[] }) {
  const ref = useRef<InstancedMesh>(null);
  const selected = useExplorer((s) => s.selected?.id);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const obj = new Object3D();
    const color = new Color();
    const times = events.map((event) => Date.parse(event.occurredAt));
    const newest = times.length ? Math.max(...times) : 0;
    const oldest = times.length ? Math.min(...times) : newest;
    const recentWindow = Math.max(60_000, (newest - oldest) * 0.12);
    events.forEach((e, i) => {
      obj.position
        .set(...position(e.latitude, e.longitude))
        .multiplyScalar(1.004);
      const recent = newest - Date.parse(e.occurredAt) <= recentWindow;
      obj.scale.setScalar(markerSize(e.magnitude) * (e.id === selected ? 3 : recent ? 1.8 : 1.15));
      obj.updateMatrix();
      ref.current!.setMatrixAt(i, obj.matrix);
      ref.current!.setColorAt(i, color.set(depthColor(e.depthKm)));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [events, selected]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, events.length]}
      raycast={() => {}}
    >
      <sphereGeometry args={[1, 12, 8]} />
      <meshBasicMaterial
        transparent
        opacity={0.22}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </instancedMesh>
  );
}
function EventPulse({ event }: { event?: Event }) {
  const ref = useRef<Mesh>(null);
  const started = useRef<number | null>(null);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    if (started.current === null) started.current = clock.getElapsedTime();
    const phase = Math.min(1, (clock.getElapsedTime() - started.current) / 1.4);
    ref.current.scale.setScalar(1 + phase * 3);
    (ref.current.material as MeshBasicMaterial).opacity = (1 - phase) * 0.35;
  });
  if (!event) return null;
  return <mesh ref={ref} position={position(event.latitude, event.longitude).map((v) => v * 1.005) as [number, number, number]} scale={markerSize(event.magnitude) * 1.6}>
    <sphereGeometry args={[1, 16, 10]} />
    <meshBasicMaterial color={depthColor(event.depthKm)} transparent opacity={0.35} depthWrite={false} blending={AdditiveBlending} />
  </mesh>;
}
function Earth({ events }: { events: Event[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const [hoveredBoundary, setHoveredBoundary] = useState<string | null>(null);
  const [boundaries, setBoundaries] = useState<BoundaryPath[]>([]);
  const plates = useExplorer((s) => s.tectonicPlates);
  const selected = useExplorer((s) => s.selected);
  const selectedBoundary = useExplorer((s) => s.selectedBoundary);
  const set = useExplorer((s) => s.set);
  useEffect(() => {
    let active = true;
    loadBoundaries()
      .then((data) => {
        if (active) {
          setBoundaries(data);
          set({ tectonicError: data.length ? null : "PB2002 contains no usable boundaries." });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setBoundaries([]);
          set({
            tectonicError:
              error instanceof Error
                ? `Tectonic data unavailable: ${error.message}`
                : "Tectonic data unavailable.",
          });
        }
      });
    return () => {
      active = false;
      document.body.style.cursor = "auto";
    };
  }, [set]);
  return (
    <Globe
      globeImageUrl="/earth.jpg"
      atmosphereColor="#59c8ff"
      atmosphereAltitude={0.12}
      globeCurvatureResolution={3}
      pointsData={events}
      pointLat="latitude"
      pointLng="longitude"
      pointAltitude={0.003}
      pointColor={(d: object) => depthColor((d as Event).depthKm)}
      pointRadius={(d: object) =>
        markerSize((d as Event).magnitude) *
        ((d as Event).id === hover || (d as Event).id === selected?.id
          ? 1.7
          : 1)
      }
      pointsTransitionDuration={0}
      pathsData={plates ? boundaries : []}
      pathPoints="points"
      pathPointLat="lat"
      pathPointLng="lng"
      pathPointAlt="alt"
      pathResolution={1}
      pathColor={(d: object) =>
        (d as BoundaryPath).id === selectedBoundary?.id ||
        (d as BoundaryPath).id === hoveredBoundary
          ? "#d7fbff"
          : "#55d9ed"
      }
      pathStroke={(d: object) =>
        (d as BoundaryPath).id === selectedBoundary?.id ||
        (d as BoundaryPath).id === hoveredBoundary
          ? 0.48
          : 0.2
      }
      pathTransitionDuration={240}
      onClick={(layer: string, d: object | undefined) => {
        if (!d) return;
        if (layer === "path")
          set({ selectedBoundary: d as BoundaryPath, selected: null });
        else if ("sourceId" in d)
          set({ selected: d as Event, selectedBoundary: null, isPlaying: false });
      }}
      onHover={(layer: string | undefined, d: object | undefined) => {
        setHover(d && "sourceId" in d ? String((d as Event).id) : null);
        setHoveredBoundary(layer === "path" && d ? (d as BoundaryPath).id : null);
        document.body.style.cursor = d ? "pointer" : "auto";
      }}
    />
  );
}
export default function Scene({ events }: { events: Event[] }) {
  return (
    <Canvas
      camera={{
        position: position(-5, 118).map((v) => v * 2.8) as [
          number,
          number,
          number,
        ],
        near: 1,
        far: 3000,
        fov: 46,
      }}
      dpr={[1, 1.5]}
    >
      <color attach="background" args={["#030913"]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[200, 150, 250]} intensity={2} />
      <Stars
        radius={900}
        depth={500}
        count={1800}
        factor={2}
        fade
        speed={0.1}
      />
      <Suspense fallback={null}>
        <Earth events={events} />
        <Halos events={events} />
        <EventPulse key={events.at(-1)?.id ?? "none"} event={events.at(-1)} />
      </Suspense>
      <Camera />
    </Canvas>
  );
}
