// engine/pipeline/GpuHooks.ts
//
// GPU integration points the dimensional engines use to push geometry and
// effects into the Zante renderer. Dimensions never touch the GPU device
// directly — they go through these hooks, which keeps the render backend
// swappable and the dimensional code pure-data.

import type { IGpuDevice } from '../../core/zante/native/gpu/IGpuDevice';
import type { ISceneGraph } from '../../core/zante/native/scene/ISceneGraph';
import { AssetConverter } from '../../core/zante/native/interop/AssetConverter';
import type { NativeMesh, Material, Mat4 } from '../../core/zante/native/types';
import type { NodeId } from '../../core/zante/native/scene/SceneNode';

/**
 * The render-side handles a dimension may use: upload a mesh, tag a scene
 * subtree, request a material. Backed by the native core's AssetConverter +
 * GPU device.
 */
export class GpuHooks {
  private readonly converter: AssetConverter;

  constructor(
    private readonly gpu: IGpuDevice,
    private readonly scene: ISceneGraph
  ) {
    this.converter = new AssetConverter(gpu, scene);
  }

  /** Upload + place a dimensional mesh (road ribbon, junction volume, …). */
  placeMesh(
    mesh: NativeMesh,
    material: Material,
    opts: { transform?: Mat4; layer?: number; tags?: readonly string[]; parent?: NodeId } = {}
  ): NodeId {
    return this.converter.place(mesh, { material, ...opts });
  }

  /** Drop a previously placed dimensional node. */
  remove(id: NodeId): void {
    this.scene.remove(id);
  }

  /** All nodes a dimension previously tagged — for batch updates. */
  tagged(tag: string) {
    return this.scene.byTag(tag);
  }

  device(): IGpuDevice {
    return this.gpu;
  }
}
