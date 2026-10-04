"use client";

import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { DoubleSide, SRGBColorSpace, TextureLoader, type Texture } from "three";

const FIT = { width: 2.3, height: 2.9 } as const;

export interface PlaneSize {
  width: number;
  height: number;
}

/** Fits a photo of any aspect inside the scene box without stretching it. */
export function fitPlane(imageWidth: number, imageHeight: number): PlaneSize {
  const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1;
  if (aspect >= FIT.width / FIT.height) return { width: FIT.width, height: FIT.width / aspect };
  return { width: FIT.height * aspect, height: FIT.height };
}

export function usePhotoTexture(url: string): { texture: Texture; size: PlaneSize } {
  // A load or CORS failure throws, and the shared SceneCanvas boundary falls back to the flat photo.
  const texture = useLoader(TextureLoader, url);
  return useMemo(() => {
    texture.colorSpace = SRGBColorSpace;
    const image = texture.image as { width?: number; height?: number } | undefined;
    return { texture, size: fitPlane(image?.width ?? 1, image?.height ?? 1) };
  }, [texture]);
}

/** The user's photo, in its natural colors (unlit, never tinted). */
export function PhotoPlane({
  url,
  children,
}: {
  url: string;
  children?: (size: PlaneSize) => React.ReactNode;
}) {
  const { texture, size } = usePhotoTexture(url);
  return (
    <group>
      <mesh>
        <planeGeometry args={[size.width, size.height]} />
        <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} />
      </mesh>
      {children?.(size)}
    </group>
  );
}
