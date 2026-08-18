// core/zante/native/scene/ISceneGraph.ts

import type { ISceneNode, NodeId } from './SceneNode';
import type { Camera } from '../types';

/**
 * Scene management interface. The Dynamic Engine populates the graph (roads,
 * meshes, terrain, widgets); the renderer consumes `visibleNodes` each frame.
 * Keeping this an interface lets the A/E build swap a flat array for a BVH /
 * spatial-hash without touching either producer or consumer.
 */
export interface ISceneGraph {
  readonly root: NodeId;

  add(node: ISceneNode, parent?: NodeId): NodeId;
  remove(id: NodeId): void;
  get(id: NodeId): ISceneNode | undefined;

  /** Re-parent and mark the subtree dirty for world-transform recompute. */
  reparent(id: NodeId, newParent: NodeId): void;

  /** Flag a node so its world transform is recomputed on the next update(). */
  markDirty(id: NodeId): void;

  /** Recompute world transforms for any dirty subtrees. */
  update(): void;

  /** Nodes that survive frustum culling against `camera`, draw-order sorted. */
  visibleNodes(camera: Camera): Iterable<ISceneNode>;

  /** All nodes carrying `tag` — subsystems use this to find their own meshes. */
  byTag(tag: string): ISceneNode[];

  clear(): void;
}
