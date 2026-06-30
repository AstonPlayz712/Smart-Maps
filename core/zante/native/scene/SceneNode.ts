// core/zante/native/scene/SceneNode.ts

import type { Mat4, MeshHandle, MaterialHandle, AABB } from '../types';
import { IDENTITY_MAT4 } from '../types';

export type NodeId = string;

/**
 * A node in the Zante scene graph. Holds a local transform plus optional
 * renderable payload (mesh + material). Parent/child links form the tree the
 * renderer walks; `worldTransform` is the cached parent-composed matrix the
 * scene graph refreshes when the tree is marked dirty.
 */
export interface ISceneNode {
  readonly id: NodeId;
  name?: string;
  parent: NodeId | null;
  children: NodeId[];

  localTransform: Mat4;
  worldTransform?: Mat4;

  mesh?: MeshHandle | null;
  material?: MaterialHandle | null;

  /** Draw bucket — widgets and overlays use higher layers. */
  layer?: number;
  /** Skip culling + drawing without detaching from the tree. */
  visible: boolean;
  /** World-space bounds for frustum culling, if known. */
  bounds?: AABB;
  /** Free-form tags so subsystems (3D/4D/…) can find their own nodes. */
  tags?: readonly string[];
}

let counter = 0;

export function createSceneNode(init: Partial<ISceneNode> = {}): ISceneNode {
  return {
    id: init.id ?? `node-${++counter}`,
    name: init.name,
    parent: init.parent ?? null,
    children: init.children ? [...init.children] : [],
    localTransform: init.localTransform ?? IDENTITY_MAT4,
    worldTransform: init.worldTransform,
    mesh: init.mesh ?? null,
    material: init.material ?? null,
    layer: init.layer ?? 0,
    visible: init.visible ?? true,
    bounds: init.bounds,
    tags: init.tags
  };
}
