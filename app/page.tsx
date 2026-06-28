'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

import type { CaptureStatus, Packet } from '@/lib/types';

const PROTOCOLS = ['TCP', 'UDP', 'ICMP', 'HTTP', 'DNS', 'ARP', 'Other'];
const MAX_PACKETS = 200;

export default function NetworkTrafficMonitor() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [filter, setFilter] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('All');
  const [selectedInterface, setSelectedInterface] = useState('any');
  const [interfaces, setInterfaces] = useState<string[]>(['any']);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [tcpdumpAvailable, setTcpdumpAvailable] = useState(true);
  const [stats, setStats] = useState({
    totalPackets: 0,
    totalBytes: 0,
    tcpCount: 0,
    udpCount: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const applyStatus = useCallback((status: CaptureStatus) => {
    setIsCapturing(status.capturing);
    setCaptureError(status.error);
    setTcpdumpAvailable(status.tcpdumpAvailable);
    if (status.interface) {
      setSelectedInterface(status.interface);
    }
  }, []);

  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const [statusRes, interfacesRes] = await Promise.all([
          fetch('/api/capture'),
          fetch('/api/interfaces'),
        ]);

        if (statusRes.ok) {
          applyStatus((await statusRes.json()) as CaptureStatus);
        }

        if (interfacesRes.ok) {
          const data = (await interfacesRes.json()) as { interfaces: string[] };
          if (data.interfaces.length > 0) {
            setInterfaces(data.interfaces);
          }
        }
      } catch {
        setCaptureError('Failed to reach capture API. Is the server running?');
      }
    };

    void loadInitialState();
  }, [applyStatus]);

  useEffect(() => {
    const source = new EventSource('/api/capture/stream');
    eventSourceRef.current = source;

    source.addEventListener('packet', (event) => {
      const packet = JSON.parse(event.data) as Packet;
      setPackets((prev) => [packet, ...prev].slice(0, MAX_PACKETS));
      setStats((prev) => ({
        totalPackets: prev.totalPackets + 1,
        totalBytes: prev.totalBytes + packet.length,
        tcpCount: prev.tcpCount + (packet.protocol === 'TCP' ? 1 : 0),
        udpCount: prev.udpCount + (packet.protocol === 'UDP' ? 1 : 0),
      }));
    });

    source.onerror = () => {
      setCaptureError((prev) => prev ?? 'Lost connection to capture stream. Reconnecting…');
    };

    return () => {
      source.close();
      eventSourceRef.current = null;
    };
  }, []);

  const filteredPackets = packets.filter(
    (p) =>
      (protocolFilter === 'All' || p.protocol === protocolFilter) &&
      (p.sourceIP.includes(filter) ||
        p.destIP.includes(filter) ||
        p.info.toLowerCase().includes(filter.toLowerCase())),
  );

  const toggleCapture = async () => {
    setCaptureError(null);

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isCapturing
            ? { action: 'stop' }
            : { action: 'start', interface: selectedInterface },
        ),
      });

      const status = (await response.json()) as CaptureStatus;
      applyStatus(status);

      if (!response.ok && status.error) {
        setCaptureError(status.error);
      }
    } catch {
      setCaptureError('Failed to toggle capture. Check server logs.');
    }
  };

  const clearPackets = () => {
    setPackets([]);
    setStats({ totalPackets: 0, totalBytes: 0, tcpCount: 0, udpCount: 0 });
  };

  const exportPackets = () => {
    const csv =
      'Timestamp,Source IP,Dest IP,Protocol,Length,Info\n' +
      filteredPackets
        .map(
          (p) =>
            `${p.timestamp},${p.sourceIP},${p.destIP},${p.protocol},${p.length},"${p.info.replace(/"/g, '""')}"`,
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'network-traffic.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center">
              <span className="text-white text-xl">📡</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Network Traffic Monitor</h1>
              <p className="text-sm text-zinc-400">Live capture via tcpdump + Server-Sent Events</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800 rounded-full text-sm">
              <div
                className={`w-2 h-2 rounded-full ${isCapturing ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`}
              />
              {isCapturing ? 'CAPTURING' : 'PAUSED'}
            </div>
            <button
              onClick={() => void toggleCapture()}
              disabled={!tcpdumpAvailable && !isCapturing}
              className="flex items-center gap-2 px-5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              {isCapturing ? '⏸️' : '▶️'} {isCapturing ? 'Pause' : 'Start'} Capture
            </button>
            <button
              onClick={clearPackets}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
            >
              🗑️ Clear
            </button>
            <button
              onClick={exportPackets}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
            >
              ⬇️ Export CSV
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        <div className="w-80 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sticky top-24">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xl">🔍</span>
              <h2 className="font-semibold">Filters</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">
                  Network Interface
                </label>
                <select
                  value={selectedInterface}
                  onChange={(e) => setSelectedInterface(e.target.value)}
                  disabled={isCapturing}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                >
                  {interfaces.map((iface) => (
                    <option key={iface} value={iface}>
                      {iface}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">
                  Search IP or Info
                </label>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="192.168.1.1 or DNS"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-zinc-500 mb-2 block">
                  Protocol
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['All', ...PROTOCOLS].map((prot) => (
                    <button
                      key={prot}
                      onClick={() => setProtocolFilter(prot)}
                      className={`py-2 text-sm rounded-xl transition-all ${
                        protocolFilter === prot
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-800 hover:bg-zinc-700'
                      }`}
                    >
                      {prot}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-zinc-800">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">⚡ Live Stats</h3>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Total Packets</span>
                    <span className="font-mono">{stats.totalPackets.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Total Bytes</span>
                    <span className="font-mono">{(stats.totalBytes / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">TCP</span>
                    <span className="font-mono text-blue-400">{stats.tcpCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">UDP</span>
                    <span className="font-mono text-purple-400">{stats.udpCount}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1">
          {(captureError || !tcpdumpAvailable) && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-900/50 rounded-2xl text-red-300 text-sm">
              <p className="font-medium mb-1">Capture issue</p>
              <p>{captureError ?? 'tcpdump is not installed on this system.'}</p>
              {!tcpdumpAvailable && (
                <p className="mt-2 text-red-200/80 text-xs">
                  Install: <code className="font-mono">sudo pacman -S tcpdump</code> (Arch) or{' '}
                  <code className="font-mono">sudo apt install tcpdump</code> (Debian/Ubuntu)
                </p>
              )}
              {captureError?.includes('CAP_NET_RAW') && (
                <div className="mt-3 space-y-1 text-red-200/80 text-xs font-mono">
                  <p>Fix (run once in your terminal):</p>
                  <p>sudo setcap cap_net_raw,cap_net_admin=eip /usr/bin/tcpdump</p>
                  <p>or: sudo ./scripts/setup-capture.sh</p>
                </div>
              )}
            </div>
          )}

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Live Packets</h2>
              <p className="text-zinc-400 text-sm">
                Showing {filteredPackets.length} of {packets.length} packets
                {isCapturing ? ` on ${selectedInterface}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              🕒 Streaming via SSE
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-full divide-y divide-zinc-800">
                <thead>
                  <tr className="bg-zinc-950">
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Source IP
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Dest IP
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Protocol
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Length
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      Info
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredPackets.length > 0 ? (
                    filteredPackets.map((packet) => (
                      <tr key={packet.id} className="hover:bg-zinc-800/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-zinc-400">
                          {new Date(packet.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                          {packet.sourceIP}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">
                          {packet.destIP}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${
                              packet.protocol === 'TCP'
                                ? 'bg-blue-500/10 text-blue-400'
                                : packet.protocol === 'UDP'
                                  ? 'bg-purple-500/10 text-purple-400'
                                  : packet.protocol === 'ICMP'
                                    ? 'bg-orange-500/10 text-orange-400'
                                    : packet.protocol === 'ARP'
                                      ? 'bg-yellow-500/10 text-yellow-400'
                                      : 'bg-zinc-700 text-zinc-300'
                            }`}
                          >
                            {packet.protocol}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-emerald-400">
                          {packet.length} B
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-300">{packet.info}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-zinc-500">
                        {isCapturing
                          ? 'Waiting for network activity…'
                          : 'Start capture to monitor live traffic'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 p-6 bg-amber-950/50 border border-amber-900/50 rounded-2xl text-amber-400 text-sm">
            <div className="flex gap-3">
              <span className="text-xl mt-0.5 flex-shrink-0">⚠️</span>
              <div>
                <p className="font-medium mb-1">Privileges &amp; legal notice</p>
                <p>
                  Live capture uses <code className="font-mono text-amber-200">tcpdump</code> on the
                  server and streams packets to the browser over Server-Sent Events. Packet sniffing
                  requires elevated privileges and must comply with local laws.
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 text-amber-300/80 text-xs">
                  <li>
                    Install tcpdump: <code className="font-mono">sudo pacman -S tcpdump</code>
                  </li>
                  <li>
                    Grant capture to tcpdump (required — Node caps are not inherited):{' '}
                    <code className="font-mono">
                      sudo setcap cap_net_raw,cap_net_admin=eip /usr/bin/tcpdump
                    </code>
                  </li>
                  <li>Or run: sudo ./scripts/setup-capture.sh</li>
                  <li>Use locally only — do not expose this dashboard to the public internet.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
