export type Kind = "rules" | "skill" | "mcp-server" | "mcp-tool";
export type Scope = "project" | "user";
export type Loading = "always" | "on-demand" | "unmeasured";

/** One thing an agent may put into its context window. */
export interface Item {
  agent: string;
  kind: Kind;
  name: string;
  path: string;
  scope: Scope;
  loading: Loading;
  tokens: number | null;
}

export interface ScanContext {
  /** Absolute path of the project being scanned. */
  project: string;
  /** Absolute path of the home directory. */
  home: string;
  /** False with --no-user: skip everything under `home`. */
  includeUser: boolean;
}

export interface Adapter {
  id: string;
  label: string;
  /** True once paths and formats were checked against the agent's official docs. */
  verified: boolean;
  scan(ctx: ScanContext): Item[];
}
