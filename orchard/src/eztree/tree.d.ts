import * as THREE from 'three';

export interface TreeOptions {
  seed: number;
  type: string;
  bark: {
    type: string;
    maps: {
      color: THREE.Texture | null;
      ao: THREE.Texture | null;
      normal: THREE.Texture | null;
      roughness: THREE.Texture | null;
    };
    tint: number;
    flatShading: boolean;
    textured: boolean;
    textureScale: { x: number; y: number };
  };
  branch: {
    levels: number;
    angle: Record<1 | 2 | 3, number>;
    children: Record<0 | 1 | 2, number>;
    force: { direction: { x: number; y: number; z: number }; strength: number };
    gnarliness: Record<0 | 1 | 2 | 3, number>;
    length: Record<0 | 1 | 2 | 3, number>;
    radius: Record<0 | 1 | 2 | 3, number>;
    sections: Record<0 | 1 | 2 | 3, number>;
    segments: Record<0 | 1 | 2 | 3, number>;
    start: Record<1 | 2 | 3, number>;
    taper: Record<0 | 1 | 2 | 3, number>;
    twist: Record<0 | 1 | 2 | 3, number>;
  };
  leaves: {
    type: string;
    map: THREE.Texture | null;
    billboard: string;
    angle: number;
    count: number;
    start: number;
    size: number;
    sizeVariance: number;
    tint: number;
    alphaTest: number;
    roundedNormals: boolean;
  };
  trellis: {
    enabled: boolean;
    position: { x: number; y: number; z: number };
    width: number;
    height: number;
    spacing: number;
    force: { strength: number; maxDistance: number; falloff: number };
    cylinderRadius: number;
    visible: boolean;
    color: number;
  };
  copy(source: TreeOptions, target?: unknown): void;
}

export declare class Tree extends THREE.Group {
  constructor(options?: TreeOptions);
  options: TreeOptions;
  rng: unknown;
  branchQueue: unknown[];
  skeleton: unknown;
  branchesMesh: THREE.Mesh;
  leavesMesh: THREE.Mesh;
  branches: {
    verts: number[];
    normals: number[];
    indices: number[];
    uvs: number[];
    windFactor: number[];
  };
  leaves: {
    verts: number[];
    normals: number[];
    indices: number[];
    uvs: number[];
  };
  update(elapsedTime: number): void;
  loadPreset(name: string): void;
  loadFromJson(json: TreeOptions): void;
  generate(): void;
  generateLODs(levels?: unknown[]): void;
  createGeometry(detail?: Record<string, unknown>): {
    branches: THREE.BufferGeometry;
    leaves: THREE.BufferGeometry;
  };
}
