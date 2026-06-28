# Local Network Traffic Monitor

A real-time network traffic monitoring dashboard built with **Next.js 16**, **TypeScript**, and **Tailwind CSS**.

## Features

- **Live packet capture** via `tcpdump` on the server
- **Real-time streaming** to the browser using Server-Sent Events (SSE)
- Live statistics (packets, bytes, protocols)
- Interface selection (`any`, `lo`, `eth0`, `wlan0`, etc.)
- Advanced filtering by IP, protocol, info
- Export captured data to CSV
- Modern dark UI with responsive design

## System Requirements

Packet capture needs `tcpdump` and sufficient privileges on the host running Next.js.

### Install tcpdump

**Arch Linux:**

```bash
sudo pacman -S tcpdump
```

**Debian / Ubuntu:**

```bash
sudo apt install tcpdump
```

### Grant capture privileges

`tcpdump` runs as a child process and does **not** inherit capabilities from Node. Grant them directly to the `tcpdump` binary:

```bash
sudo setcap cap_net_raw,cap_net_admin=eip /usr/bin/tcpdump
```

Or use the setup script:

```bash
chmod +x scripts/setup-capture.sh
sudo ./scripts/setup-capture.sh
```

Then restart the dev server and click **Start Capture**.

**Warning**: Packet sniffing requires elevated access and must comply with local laws. Use this tool only on networks you own or are authorized to monitor.

## Getting Started

```bash
cd local-network-monitor
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
Browser (EventSource)  ←── SSE ──  /api/capture/stream
       │
       └── POST /api/capture  →  CaptureManager  →  tcpdump child process
```

- `lib/capture-manager.ts` — spawns `tcpdump`, parses output, fans out to SSE subscribers
- `app/api/capture/route.ts` — start/stop capture and status
- `app/api/capture/stream/route.ts` — SSE packet stream
- `app/api/interfaces/route.ts` — lists available network interfaces

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- tcpdump + Server-Sent Events

## Git Repository

This project is already initialized as a Git repo. Push to GitHub:

```bash
git remote add origin https://github.com/yourusername/network-monitor.git
git branch -M main
git push -u origin main
```

Built with ❤️ using Grok.