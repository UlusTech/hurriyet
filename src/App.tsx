// src/App.tsx
export interface PacketInfo {
  timestamp: string;
  length: number;
  protocol: string;
  source: string;
  destination: string;
  source_port?: number;
  dest_port?: number;
  flags?: string;
  sequence?: number;
  ttl: number;
  identification: number;
}

export interface CaptureStatus {
  success: boolean;
  message: string;
  interface_name?: string;
}

export interface InterfaceInfo {
  name: string;
  description?: string;
  mac?: string;
  ipv4: string[];
}

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

function App() {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<string>("");
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [packets, setPackets] = useState<PacketInfo[]>([]);
  const [filters, setFilters] = useState({
    protocol: "",
    source: "",
    destination: "",
  });

  useEffect(() => {
    // Load available interfaces
    invoke<InterfaceInfo[]>("list_interfaces")
      .then(setInterfaces)
      .catch(console.error);

    // Listen for packet capture events
    const unlistenPackets = listen<PacketInfo>("packet-captured", (event) => {
      setPackets((prev) => [event.payload, ...prev].slice(0, 1000)); // Keep last 1000 packets
    });

    // Listen for status updates
    const unlistenStatus = listen<CaptureStatus>("capture-status", (event) => {
      setStatus(event.payload);
      if (!event.payload.success) {
        setIsCapturing(false);
      }
    });

    return () => {
      unlistenPackets.then((unlisten) => unlisten());
      unlistenStatus.then((unlisten) => unlisten());
    };
  }, []);

  const startCapture = async () => {
    try {
      await invoke("start_capture", {
        interfaceName: selectedInterface || null,
      });
      setIsCapturing(true);
      setPackets([]);
    } catch (error) {
      console.error("Failed to start capture:", error);
    }
  };

  const stopCapture = async () => {
    try {
      await invoke("stop_capture");
      setIsCapturing(false);
    } catch (error) {
      console.error("Failed to stop capture:", error);
    }
  };

  const filteredPackets = packets.filter((packet) => {
    return (
      (!filters.protocol ||
        packet.protocol
          .toLowerCase()
          .includes(filters.protocol.toLowerCase())) &&
      (!filters.source || packet.source.includes(filters.source)) &&
      (!filters.destination || packet.destination.includes(filters.destination))
    );
  });

  return (
    <div className="bg-slate-950 container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6 bg-slate-900 rounded-lg shadow p-4 sm:p-6">
        <h1 className="text-2xl font-bold mb-4 text-center text-white">
          Hürriyet Network Packet Analyzer
        </h1>

        {/* Interface Selection and Controls */}
        <div className="flex flex-wrap gap-4 mb-4">
          <select
            className="flex-1 p-2 border rounded w-full sm:w-auto max-w-full"
            value={selectedInterface}
            onChange={(e) => setSelectedInterface(e.target.value)}
            disabled={isCapturing}
          >
            <option value="">Select Interface</option>
            {interfaces.map((iface) => (
              <option key={iface.name} value={iface.name}>
                {iface.name} - {iface.description || "No description"}
              </option>
            ))}
          </select>

          <button
            onClick={isCapturing ? stopCapture : startCapture}
            className={`px-4 py-2 rounded text-black w-full sm:w-auto ${
              isCapturing
                ? "bg-red-600 hover:bg-red-500"
                : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {isCapturing ? "Stop Capture" : "Start Capture"}
          </button>
        </div>

        {/* Status Message */}
        {status && (
          <div
            className={`p-3 rounded text-center ${
              status.success
                ? "bg-green-600 text-green-100"
                : "bg-red-600 text-red-700"
            }`}
          >
            {status.message}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 bg-slate-900 rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-2 text-white">Filters</h2>
        <div className="flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="Protocol Filter"
            className="flex-1 p-2 border rounded"
            value={filters.protocol}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, protocol: e.target.value }))
            }
          />
          <input
            type="text"
            placeholder="Source IP Filter"
            className="flex-1 p-2 border rounded"
            value={filters.source}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, source: e.target.value }))
            }
          />
          <input
            type="text"
            placeholder="Destination IP Filter"
            className="flex-1 p-2 border rounded"
            value={filters.destination}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, destination: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Packet Table */}
      <div className="bg-slate-900 rounded-lg shadow overflow-x-auto">
        <table className="min-w-full whitespace-nowrap">
          <thead className="bg-gray-900">
            <tr>
              <th className="p-3 text-left text-white">Time</th>
              <th className="p-3 text-left text-white">Protocol</th>
              <th className="p-3 text-left text-white">Source</th>
              <th className="p-3 text-left text-white">Destination</th>
              <th className="p-3 text-left text-white">Length</th>
              <th className="p-3 text-left text-white">Flags</th>
              <th className="p-3 text-left text-white">TTL</th>
            </tr>
          </thead>
          <tbody>
            {filteredPackets.map((packet, index) => (
              <tr key={index} className="border-t hover:bg-gray-800">
                <td className="p-3 text-white">
                  {new Date(
                    parseInt(packet.timestamp) * 1000
                  ).toLocaleTimeString()}
                </td>
                <td className="p-3 text-white">{packet.protocol}</td>
                <td className="p-3 text-white">
                  {packet.source}
                  {packet.source_port ? `:${packet.source_port}` : ""}
                </td>
                <td className="p-3 text-white">
                  {packet.destination}
                  {packet.dest_port ? `:${packet.dest_port}` : ""}
                </td>
                <td className="p-3 text-white">{packet.length}</td>
                <td className="p-3 text-white">{packet.flags || "-"}</td>
                <td className="p-3 text-white">{packet.ttl}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
