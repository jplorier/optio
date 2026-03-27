export interface ContainerSpec {
  image: string;
  command: string[];
  env: Record<string, string>;
  workDir: string;
  cpuRequest?: string;
  memoryRequest?: string;
  cpuLimit?: string;
  memoryLimit?: string;
  labels: Record<string, string>;
  volumes?: VolumeMount[];
  networkMode?: string;
  imagePullPolicy?: "Always" | "Never" | "IfNotPresent";
  /** Optional pod name override. If not set, the runtime generates one. */
  name?: string;
  /** Set to false to enable K8s user namespace isolation (hostUsers: false). */
  hostUsers?: boolean;
  /** Linux capabilities to add to the container security context. */
  capabilities?: string[];
  /** Tmpfs mounts (memory-backed volumes) for the container. */
  tmpfsMounts?: { mountPath: string; sizeLimit?: string }[];
}

export interface VolumeMount {
  hostPath?: string;
  persistentVolumeClaim?: string;
  mountPath: string;
  readOnly?: boolean;
}

export interface ContainerHandle {
  id: string;
  name: string;
}

export interface ContainerStatus {
  state: "pending" | "running" | "succeeded" | "failed" | "unknown";
  exitCode?: number;
  startedAt?: Date;
  finishedAt?: Date;
  reason?: string;
}

export interface ExecSession {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  resize(cols: number, rows: number): void;
  close(): void;
}
