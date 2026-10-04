"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  NormalBlending,
  ShaderMaterial,
  type Points,
} from "three";
import type { StepId } from "@/lib/scans/stages";
import { LeafModel } from "../LeafModel";
import { useIsMobile, useSceneColors } from "../hooks";
import { beamParams, damp, sweepPosition } from "./beam-params";
import { PhotoPlane, type PlaneSize } from "./PhotoPlane";

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uBeam;
  uniform float uIntensity;
  uniform vec3 uColor;
  void main() {
    float d = abs(vUv.y - uBeam);
    float core = smoothstep(0.014, 0.0, d);
    float glow = smoothstep(0.24, 0.0, d) * 0.4;
    float trail = vUv.y < uBeam ? smoothstep(0.0, uBeam, vUv.y) * 0.1 : 0.0;
    float alpha = (core + glow + trail) * uIntensity;
    gl_FragColor = vec4(uColor * (0.7 + core), alpha);
  }
`;

const PARTICLES = 90;
const PARTICLES_MOBILE = 40;

function Particles({
  size,
  share,
  color,
  additive,
  count,
}: {
  size: PlaneSize;
  share: { current: number };
  color: string;
  additive: boolean;
  count: number;
}) {
  const points = useRef<Points>(null);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * size.width * 1.1;
      positions[i * 3 + 1] = (Math.random() - 0.5) * size.height;
      positions[i * 3 + 2] = 0.05 + Math.random() * 0.25;
    }
    g.setAttribute("position", new BufferAttribute(positions, 3));
    return g;
  }, [count, size.height, size.width]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const target = points.current;
    if (!target) return;
    const attribute = geometry.getAttribute("position") as BufferAttribute;
    for (let i = 0; i < count; i += 1) {
      const y = attribute.getY(i) + delta * 0.18;
      attribute.setY(i, y > size.height / 2 ? -size.height / 2 : y);
    }
    attribute.needsUpdate = true;
    const material = target.material as { opacity: number };
    material.opacity = share.current * 0.9;
    target.visible = share.current > 0.02;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={0.045}
        transparent
        depthWrite={false}
        blending={additive ? AdditiveBlending : NormalBlending}
      />
    </points>
  );
}

function Beam({
  size,
  step,
  color,
  additive,
  mobile,
}: {
  size: PlaneSize;
  step: StepId;
  color: string;
  additive: boolean;
  mobile: boolean;
}) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: additive ? AdditiveBlending : NormalBlending,
        uniforms: {
          uBeam: { value: 0 },
          uIntensity: { value: 0 },
          uColor: { value: new Color(color) },
        },
      }),
    [additive, color],
  );
  useEffect(() => () => material.dispose(), [material]);

  const state = useRef({ speed: 0, intensity: 0, particles: 0, time: 0 });
  const share = useRef(0);
  const target = beamParams(step);

  useFrame((_, delta) => {
    const s = state.current;
    s.speed = damp(s.speed, target.speed, 3, delta);
    s.intensity = damp(s.intensity, target.intensity, 3, delta);
    s.particles = damp(s.particles, target.particles, 2, delta);
    s.time += delta * s.speed;
    share.current = s.particles;
    material.uniforms.uBeam!.value = sweepPosition(s.time, 1);
    material.uniforms.uIntensity!.value = s.intensity;
  });

  return (
    <>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[size.width * 1.04, size.height * 1.04]} />
        <primitive object={material} attach="material" />
      </mesh>
      <Particles
        size={size}
        share={share}
        color={color}
        additive={additive}
        count={mobile ? PARTICLES_MOBILE : PARTICLES}
      />
    </>
  );
}

interface ScanBeamSceneProps {
  photoUrl: string | null;
  step: StepId;
}

/** The uploaded leaf with a scanning beam whose speed and strength follow the real stage. */
export function ScanBeamScene({ photoUrl, step }: ScanBeamSceneProps) {
  const colors = useSceneColors();
  const mobile = useIsMobile();
  const group = useRef<Group>(null);

  useFrame((state, delta) => {
    const target = group.current;
    if (!target) return;
    target.rotation.y = damp(target.rotation.y, state.pointer.x * 0.35, 4, delta);
    target.rotation.x = damp(target.rotation.x, -state.pointer.y * 0.2, 4, delta);
  });

  const palette = useMemo(
    () => ({ base: colors.deep, vein: colors.brand, glow: colors.glow }),
    [colors.deep, colors.brand, colors.glow],
  );
  const beamColor = colors.dark ? colors.glow : colors.brand;
  const fallbackSize: PlaneSize = { width: 1.8, height: 2.6 };

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 3, 4]} intensity={1.2} />
      <group ref={group}>
        {photoUrl ? (
          <PhotoPlane url={photoUrl}>
            {(size) => (
              <Beam
                size={size}
                step={step}
                color={beamColor}
                additive={colors.dark}
                mobile={mobile}
              />
            )}
          </PhotoPlane>
        ) : (
          <>
            <LeafModel palette={palette} scale={1.3} mobile={mobile} />
            <Beam
              size={fallbackSize}
              step={step}
              color={beamColor}
              additive={colors.dark}
              mobile={mobile}
            />
          </>
        )}
      </group>
    </>
  );
}
