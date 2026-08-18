// core/zante/native/scene/SceneGraph.ts

import type { ISceneGraph } from './ISceneGraph';
import type { ISceneNode, NodeId } from './SceneNode';
import { createSceneNode } from './SceneNode';
import type { Camera, Mat4 } from '../types';
import { IDENTITY_MAT4 } from '../types';

/**
 * Reference scene graph for the Zante core. Flat map of nodes keyed by id,
 * with a dirty set so `update()` only recomposes transforms that changed.
 * Culling is a stub pass-through in the Z Build; the A/E build drops a BVH in
 * behind `visibleNodes` without changing the interface.
 */
export class SceneGraph implements ISceneGraph {
  readonly root: NodeId = 'root';
  private nodes = new Map<NodeId, ISceneNode>();
  private dirty = new Set<NodeId>();

  constructor() {
    this.nodes.set(this.root, createSceneNode({ id: this.root, name: 'root' }));
  }

  add(node: ISceneNode, parent: NodeId = this.root): NodeId {
    node.parent = parent;
    this.nodes.set(node.id, node);
    this.nodes.get(parent)?.children.push(node.id);
    this.dirty.add(node.id);
    return node.id;
  }

  remove(id: NodeId): void {
    const node = this.nodes.get(id);
    if (!node) return;
    for (const child of [...node.children]) this.remove(child);
    const parent = node.parent ? this.nodes.get(node.parent) : undefined;
    if (parent) parent.children = parent.children.filter((c) => c !== id);
    this.nodes.delete(id);
    this.dirty.delete(id);
  }

  get(id: NodeId): ISceneNode | undefined {
    return this.nodes.get(id);
  }

  reparent(id: NodeId, newParent: NodeId): void {
    const node = this.nodes.get(id);
    if (!node || !this.nodes.has(newParent)) return;
    if (node.parent) {
      const old = this.nodes.get(node.parent);
      if (old) old.children = old.children.filter((c) => c !== id);
    }
    node.parent = newParent;
    this.nodes.get(newParent)?.children.push(id);
    this.dirty.add(id);
  }

  markDirty(id: NodeId): void {
    if (this.nodes.has(id)) this.dirty.add(id);
  }

  update(): void {
    if (this.dirty.size === 0) return;
    // Simple top-down recompute from root; the A/E build will scope this to
    // only the dirty subtrees.
    this.composeFrom(this.root, IDENTITY_MAT4);
    this.dirty.clear();
  }

  private composeFrom(id: NodeId, parentWorld: Mat4): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.worldTransform = multiply(parentWorld, node.localTransform);
    for (const child of node.children) this.composeFrom(child, node.worldTransform);
  }

  *visibleNodes(_camera: Camera): Iterable<ISceneNode> {
    for (const node of this.nodes.values()) {
      if (node.visible && node.mesh != null) yield node;
    }
  }

  byTag(tag: string): ISceneNode[] {
    const out: ISceneNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.tags?.includes(tag)) out.push(node);
    }
    return out;
  }

  clear(): void {
    this.nodes.clear();
    this.dirty.clear();
    this.nodes.set(this.root, createSceneNode({ id: this.root, name: 'root' }));
  }
}

/** Row-major 4×4 multiply. Kept local so the scene graph has no math dep. */
function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0) as number[];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = s;
    }
  }
  return out as unknown as Mat4;
}
