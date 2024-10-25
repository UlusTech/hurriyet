// src-tauri/src/lib.rs
use pnet::datalink::{ self, Channel, Config };
use pnet::packet::ethernet::EthernetPacket;
use pnet::packet::ip::IpNextHeaderProtocols;
use pnet::packet::ipv4::Ipv4Packet;
use pnet::packet::tcp::TcpPacket;
use pnet::packet::udp::UdpPacket;
use pnet::packet::Packet;
use serde::Serialize;
use std::sync::atomic::{ AtomicBool, Ordering };
use std::sync::Arc;
use std::time::{ SystemTime, UNIX_EPOCH };
use tauri::{ Emitter, Manager, Window };

#[derive(Serialize, Clone, Debug)]
pub struct PacketInfo {
    timestamp: String,
    length: usize,
    protocol: String,
    source: String,
    destination: String,
    source_port: Option<u16>,
    dest_port: Option<u16>,
    flags: Option<String>,
    sequence: Option<u32>,
    ttl: u8,
    identification: u16,
}

#[derive(Serialize, Clone)]
pub struct CaptureStatus {
    success: bool,
    message: String,
    interface_name: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct InterfaceInfo {
    name: String,
    description: Option<String>,
    mac: Option<String>,
    ipv4: Vec<String>,
}

#[tauri::command]
async fn list_interfaces() -> Result<Vec<InterfaceInfo>, String> {
    let interfaces = datalink::interfaces();
    Ok(
        interfaces
            .into_iter()
            .map(|iface| InterfaceInfo {
                name: iface.name,
                description: Some(iface.description),
                mac: iface.mac.map(|mac| mac.to_string()),
                ipv4: iface.ips
                    .iter()
                    .filter_map(|ip| {
                        if ip.is_ipv4() { Some(ip.to_string()) } else { None }
                    })
                    .collect(),
            })
            .collect()
    )
}

#[tauri::command]
async fn start_capture(window: Window, interface_name: Option<String>) -> Result<(), String> {
    let running = Arc::new(AtomicBool::new(true));
    let running_clone = running.clone();

    window.manage(running);

    std::thread::spawn(move || {
        if let Err(e) = init_capture(&window, interface_name, running_clone) {
            let status = CaptureStatus {
                success: false,
                message: e,
                interface_name: None,
            };
            let _ = window.emit("capture-status", status);
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_capture(state: tauri::State<'_, Arc<AtomicBool>>) -> Result<(), String> {
    state.store(false, Ordering::SeqCst);
    Ok(())
}

fn init_capture(
    window: &Window,
    interface_name: Option<String>,
    running: Arc<AtomicBool>
) -> Result<(), String> {
    let interfaces = datalink::interfaces();

    let interface = match &interface_name {
        // Changed to reference here
        Some(name) =>
            interfaces
                .into_iter()
                .find(|iface| iface.name == *name) // Dereferencing here
                .ok_or_else(|| "Specified interface not found".to_string())?,
        None =>
            interfaces
                .into_iter()
                .find(|iface| iface.is_up() && !iface.is_loopback())
                .ok_or_else(|| "No active network interface found".to_string())?,
    };

    println!("Using device: {}", interface.name);

    let config = Config::default();
    let (_, mut rx) = match datalink::channel(&interface, config) {
        Ok(Channel::Ethernet(tx, rx)) => (tx, rx),
        Ok(_) => {
            return Err("Unhandled channel type".to_string());
        }
        Err(e) => {
            return Err(format!("Failed to create datalink channel: {}", e));
        }
    };

    let status = CaptureStatus {
        success: true,
        message: format!("Capture started on interface: {}", interface.name),
        interface_name: Some(interface.name.clone()),
    };
    let _ = window.emit("capture-status", status);

    while running.load(Ordering::SeqCst) {
        match rx.next() {
            Ok(packet) => {
                if let Some(ethernet_packet) = EthernetPacket::new(packet) {
                    if let Some(ip_packet) = Ipv4Packet::new(ethernet_packet.payload()) {
                        let packet_info = analyze_packet(&ip_packet);
                        if let Err(e) = window.emit("packet-captured", packet_info) {
                            println!("Failed to emit packet info: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                println!("Failed to receive packet: {}", e);
            }
        }
    }

    let status = CaptureStatus {
        success: true,
        message: "Capture stopped".to_string(),
        interface_name: Some(interface.name),
    };
    let _ = window.emit("capture-status", status);

    Ok(())
}

fn analyze_packet(ip_packet: &Ipv4Packet) -> PacketInfo {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string();

    let mut packet_info = PacketInfo {
        timestamp,
        length: ip_packet.packet().len(),
        protocol: "Unknown".to_string(),
        source: ip_packet.get_source().to_string(),
        destination: ip_packet.get_destination().to_string(),
        source_port: None,
        dest_port: None,
        flags: None,
        sequence: None,
        ttl: ip_packet.get_ttl(),
        identification: ip_packet.get_identification(),
    };

    match ip_packet.get_next_level_protocol() {
        IpNextHeaderProtocols::Tcp => {
            if let Some(tcp_packet) = TcpPacket::new(ip_packet.payload()) {
                packet_info.protocol = "TCP".to_string();
                packet_info.source_port = Some(tcp_packet.get_source());
                packet_info.dest_port = Some(tcp_packet.get_destination());
                packet_info.flags = Some(
                    format!(
                        "SYN:{} ACK:{} FIN:{} RST:{}",
                        (tcp_packet.get_flags() & 0b10) != 0,
                        (tcp_packet.get_flags() & 0b10000) != 0,
                        (tcp_packet.get_flags() & 0b1) != 0,
                        (tcp_packet.get_flags() & 0b100) != 0
                    )
                );
                packet_info.sequence = Some(tcp_packet.get_sequence());
            }
        }
        IpNextHeaderProtocols::Udp => {
            if let Some(udp_packet) = UdpPacket::new(ip_packet.payload()) {
                packet_info.protocol = "UDP".to_string();
                packet_info.source_port = Some(udp_packet.get_source());
                packet_info.dest_port = Some(udp_packet.get_destination());
            }
        }
        IpNextHeaderProtocols::Icmp => {
            packet_info.protocol = "ICMP".to_string();
        }
        _ => {
            packet_info.protocol = format!("Other({})", ip_packet.get_next_level_protocol().0);
        }
    }

    packet_info
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder
        ::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![start_capture, stop_capture, list_interfaces]);

    #[cfg(desktop)]
    {
        builder = builder.plugin(
            tauri_plugin_single_instance::init(|app, _args, _cwd| {
                let _ = app.get_webview_window("main").expect("no main window").set_focus();
            })
        );
    }

    builder.run(tauri::generate_context!()).expect("error while running tauri application");
}
