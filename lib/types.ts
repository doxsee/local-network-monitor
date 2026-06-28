export interface Packet {
  id: number;
  timestamp: string;
  sourceIP: string;
  destIP: string;
  protocol: string;
  length: number;
  info: string;
}

export interface CaptureStatus {
  capturing: boolean;
  interface: string | null;
  error: string | null;
  tcpdumpAvailable: boolean;
}

export type PacketListener = (packet: Packet) => void;