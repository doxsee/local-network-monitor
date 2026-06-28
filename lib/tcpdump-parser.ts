import type { Packet } from './types';

const IP_LINE =
  /^(\d+\.\d+)\s+IP(?:6)?\s+(\S+)\s+>\s+(\S+):\s+(.+)$/;
const ARP_LINE = /^(\d+\.\d+)\s+ARP,\s+(.+)$/;
const GENERIC_LINE = /^(\d+\.\d+)\s+(\S+)\s+(.+)$/;

function splitHostPort(endpoint: string): { host: string; port?: string } {
  if (endpoint.includes('[')) {
    const match = endpoint.match(/^\[([^\]]+)\](?:\.(\d+))?$/);
    if (match) {
      return { host: match[1], port: match[2] };
    }
  }

  const lastDot = endpoint.lastIndexOf('.');
  if (lastDot === -1) {
    return { host: endpoint };
  }

  const maybePort = endpoint.slice(lastDot + 1);
  if (/^\d+$/.test(maybePort)) {
    return {
      host: endpoint.slice(0, lastDot),
      port: maybePort,
    };
  }

  return { host: endpoint };
}

function inferProtocol(details: string): string {
  const upper = details.toUpperCase();
  if (upper.startsWith('TCP')) return 'TCP';
  if (upper.startsWith('UDP')) return 'UDP';
  if (upper.startsWith('ICMP')) return 'ICMP';
  if (upper.includes('DNS')) return 'DNS';
  if (upper.includes('HTTP')) return 'HTTP';
  return 'Other';
}

function extractLength(details: string): number {
  const match = details.match(/length\s+(\d+)/i);
  if (match) {
    return Number.parseInt(match[1], 10);
  }

  const tcpMatch = details.match(/\b(?:tcp|udp)\s+(\d+)\b/i);
  if (tcpMatch) {
    return Number.parseInt(tcpMatch[1], 10);
  }

  return 0;
}

function buildInfo(protocol: string, details: string, sourcePort?: string, destPort?: string): string {
  const ports =
    sourcePort && destPort ? `${sourcePort} → ${destPort}` : sourcePort || destPort || '';
  const summary = details.replace(/\s+/g, ' ').trim();
  return ports ? `${protocol}${ports ? ` ${ports}` : ''}: ${summary}` : summary;
}

export function parseTcpdumpLine(line: string, id: number): Packet | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const ipMatch = trimmed.match(IP_LINE);
  if (ipMatch) {
    const [, epoch, sourceEndpoint, destEndpoint, details] = ipMatch;
    const source = splitHostPort(sourceEndpoint);
    const dest = splitHostPort(destEndpoint);
    const protocol = inferProtocol(details);

    return {
      id,
      timestamp: new Date(Number.parseFloat(epoch) * 1000).toISOString(),
      sourceIP: source.host,
      destIP: dest.host,
      protocol,
      length: extractLength(details),
      info: buildInfo(protocol, details, source.port, dest.port),
    };
  }

  const arpMatch = trimmed.match(ARP_LINE);
  if (arpMatch) {
    const [, epoch, details] = arpMatch;
    return {
      id,
      timestamp: new Date(Number.parseFloat(epoch) * 1000).toISOString(),
      sourceIP: 'broadcast',
      destIP: 'local',
      protocol: 'ARP',
      length: extractLength(details),
      info: details.trim(),
    };
  }

  const genericMatch = trimmed.match(GENERIC_LINE);
  if (genericMatch) {
    const [, epoch, protocol, details] = genericMatch;
    return {
      id,
      timestamp: new Date(Number.parseFloat(epoch) * 1000).toISOString(),
      sourceIP: '—',
      destIP: '—',
      protocol: protocol.toUpperCase(),
      length: extractLength(details),
      info: details.trim(),
    };
  }

  return null;
}
