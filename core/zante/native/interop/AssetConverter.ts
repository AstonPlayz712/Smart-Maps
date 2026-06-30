// core/zante/native/interop/AssetConverter.ts
//
// Bridges a converted external mesh all the way onto the Zante GPU pipeline:
// upload, material assignment, and scene-node creation. This closes the loop
// for Task 7 — "ensure full compatibility with the Zante GPU pipeline".

import type { IGpuDevice } from '../gpu/IGpuDevice';
import type { ISceneGraph } from '../scene/ISceneGraph';
import { createSceneNode } from '../scene/SceneNode';
import type { NativeMesh, Material, MaterialHandle, Mat4 } from '../types';
import { IDENTITY_MAT4 } from '../types';
import type { NodeId } from '../scene/SceneNode';

export interface ConvertOptions {
  material: Material | MaterialHandle;
  transform?: Mat4;
  layer?: number;
  tags?: readonly string[];
  parent?: NodeId;
}

/**
 * Uploads native meshes to the GPU and wires them into the scene graph in one
 * call. External geometry, once normalised by GeometryAdapter, becomes a
 * first-class Zante scene node here — indistinguishable from native content
 * downstream.
 */
export class AssetConverter {
  constructor(
    private readonly gpu: IGpuDevice,
    private readonly scene: ISceneGraph
  ) {}

  /** Upload + register a mesh, returning the scene node id. */
  place(mesh: NativeMesh, opts: ConvertOptions): NodeId {
    const meshHandle = this.gpu.createMesh(mesh);
    const material =
      typeof opts.material === 'number'
        ? (opts.material as MaterialHandle)
        : this.gpu.createMaterial(opts.material);

    const node = createSceneNode({
      mesh: meshHandle,
      material,
      localTransform: opts.transform ?? IDENTITY_MAT4,
      layer: opts.layer,
      tags: opts.tags,
      bounds: mesh.bounds
    });
    return this.scene.add(node, opts.parent);
  }
}
