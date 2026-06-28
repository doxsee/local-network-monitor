import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';

import { parseTcpdumpLine } from './tcpdump-parser';
import type { CaptureStatus, Packet, PacketListener } from './types';

const TCPDUMP_CANDIDATES = [
  '/usr/bin/tcpdump',
  '/usr/sbin/tcpdump',
  '/sbin/tcpdump',
  'tcpdump',
];

type GlobalCaptureState = {
  captureManager?: CaptureManager;
};

const globalState = globalThis as typeof globalThis & GlobalCaptureState;

export function getAllowedInterfaces(): string[] {
  const interfaces = networkInterfaces();
  const names = Object.keys(interfaces).filter((name) => {
    const entries = interfaces[name];
    return entries?.some((entry) => !entry.internal || name === 'lo');
  });

  return ['any', ...names.sort()];
}

export function formatCapturePermissionHelp(tcpdumpPath = '/usr/bin/tcpdump'): string {
  return (
    'Packet capture requires CAP_NET_RAW on the tcpdump binary (Node capabilities are not inherited by child processes). ' +
    `Run once: sudo setcap cap_net_raw,cap_net_admin=eip ${tcpdumpPath} ` +
    'or: sudo ./scripts/setup-capture.sh'
  );
}

function isPermissionError(message: string): boolean {
  return /CAP_NET_RAW|permission to perform this capture|Operation not permitted/i.test(
    message,
  );
}

async function resolveTcpdumpPath(): Promise<string | null> {
  for (const candidate of TCPDUMP_CANDIDATES) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

class CaptureManager {
  private process: ChildProcess | null = null;
  private listeners = new Set<PacketListener>();
  private packetId = 0;
  private interfaceName: string | null = null;
  private error: string | null = null;
  private buffer = '';
  private tcpdumpPath: string | null = null;

  async getStatus(): Promise<CaptureStatus> {
    if (!this.tcpdumpPath) {
      this.tcpdumpPath = await resolveTcpdumpPath();
    }

    return {
      capturing: this.process !== null,
      interface: this.interfaceName,
      error: this.error,
      tcpdumpAvailable: this.tcpdumpPath !== null,
    };
  }

  subscribe(listener: PacketListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(packet: Packet) {
    for (const listener of this.listeners) {
      listener(packet);
    }
  }

  private handleStdout(chunk: Buffer) {
    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const packet = parseTcpdumpLine(line, ++this.packetId);
      if (packet) {
        this.emit(packet);
      }
    }
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null) {
    if (this.process) {
      this.process = null;
    }

    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGINT') {
      if (!this.error) {
        this.interfaceName = null;
      }
      return;
    }

    this.error =
      this.error ??
      `tcpdump exited unexpectedly (code ${code ?? 'null'}, signal ${signal ?? 'null'})`;
    this.interfaceName = null;
  }

  async start(requestedInterface = 'any'): Promise<CaptureStatus> {
    if (this.process) {
      return this.getStatus();
    }

    const allowed = getAllowedInterfaces();
    const interfaceName = allowed.includes(requestedInterface) ? requestedInterface : 'any';

    this.tcpdumpPath = await resolveTcpdumpPath();
    if (!this.tcpdumpPath) {
      this.error =
        'tcpdump not found. Install it with: sudo pacman -S tcpdump (Arch) or apt install tcpdump (Debian/Ubuntu).';
      return this.getStatus();
    }

    this.error = null;
    this.interfaceName = interfaceName;
    this.buffer = '';

    const args = ['-i', interfaceName, '-l', '-n', '-q', '-tt'];
    const child = spawn(this.tcpdumpPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString('utf8').trim();
      if (message) {
        this.error = isPermissionError(message)
          ? `${message}\n\n${formatCapturePermissionHelp(this.tcpdumpPath ?? '/usr/bin/tcpdump')}`
          : message;
      }
    });
    child.on('error', (err) => {
      this.error = err.message;
      this.process = null;
      this.interfaceName = null;
    });
    child.on('close', (code, signal) => this.handleExit(code, signal));

    this.process = child;
    return this.getStatus();
  }

  async stop(): Promise<CaptureStatus> {
    if (!this.process) {
      return this.getStatus();
    }

    const child = this.process;
    child.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 2000);

      child.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
    this.interfaceName = null;
    this.error = null;
    return this.getStatus();
  }
}

export function getCaptureManager(): CaptureManager {
  if (!globalState.captureManager) {
    globalState.captureManager = new CaptureManager();
  }

  return globalState.captureManager;
}
