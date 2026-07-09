"use client";
import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

interface CompRow {
  path: string;
  status: string;
  details: Record<string, unknown> | null;
}

interface Node {
  key: string;
  path: string;
  status: string;
  details: Record<string, unknown> | null;
  children: Map<string, Node>;
}

function buildTree(rows: CompRow[]): Node {
  const root: Node = {
    key: "",
    path: "",
    status: "",
    details: null,
    children: new Map(),
  };
  for (const r of rows) {
    const segs = r.path.split(".");
    let cur = root;
    let acc = "";
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      acc = acc ? `${acc}.${s}` : s;
      if (!cur.children.has(s)) {
        cur.children.set(s, {
          key: s,
          path: acc,
          status: "",
          details: null,
          children: new Map(),
        });
      }
      const child = cur.children.get(s)!;
      if (i === segs.length - 1) {
        child.status = r.status;
        child.details = r.details;
      }
      cur = child;
    }
  }
  return root;
}

function statusPill(status: string) {
  const cls =
    status === "UP"
      ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950"
      : status === "DOWN"
        ? "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950"
        : status === ""
          ? "hidden"
          : "text-neutral-700 bg-neutral-100 dark:text-neutral-300 dark:bg-neutral-800";
  return (
    <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${cls}`}>
      {status}
    </span>
  );
}

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.size > 0;
  const hasDetails =
    node.details && Object.keys(node.details).length > 0;
  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded px-1 cursor-pointer"
        style={{ paddingLeft: depth * 12 }}
        onClick={() => (hasChildren || hasDetails) && setOpen((o) => !o)}
      >
        {(hasChildren || hasDetails) ? (
          open ? (
            <ChevronDown className="w-3 h-3 text-neutral-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-neutral-500" />
          )
        ) : (
          <span className="w-3 h-3" />
        )}
        <span className="font-mono text-sm">{node.key}</span>
        {statusPill(node.status)}
      </div>
      {open && hasDetails && (
        <pre
          className="text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800 rounded p-2 my-1 overflow-x-auto"
          style={{ marginLeft: depth * 12 + 20 }}
        >
          {JSON.stringify(node.details, null, 2)}
        </pre>
      )}
      {open &&
        hasChildren &&
        Array.from(node.children.values()).map((c) => (
          <TreeNode key={c.path} node={c} depth={depth + 1} />
        ))}
    </div>
  );
}

export function ComponentTree({ components }: { components: CompRow[] }) {
  if (components.length === 0) {
    return (
      <p className="text-sm text-neutral-500">No components (no checks yet).</p>
    );
  }
  const root = buildTree(components);
  return (
    <div className="text-sm">
      {Array.from(root.children.values()).map((n) => (
        <TreeNode key={n.path} node={n} depth={0} />
      ))}
    </div>
  );
}
