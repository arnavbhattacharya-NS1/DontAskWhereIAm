import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import type { AppConfig } from '../types';
import { getSettings } from '../store';
import { getLogger } from '../logger';

// ─── macOS native CoreWLAN addon ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _wifiNative: any = null;
function getWifiNative() {
  if (_wifiNative !== null) return _wifiNative;

  // Candidate paths in priority order:
  // 1. electron-builder extraResources copies it to <resourcesPath>/native/wifi/build/Release/wifi.node
  // 2. Dev: __dirname = dist/main/services/ → up three levels to project root
  const candidates = [
    path.join(process.resourcesPath ?? '', 'native', 'wifi', 'build', 'Release', 'wifi.node'),
    path.join(__dirname, '..', '..', '..', 'native', 'wifi', 'build', 'Release', 'wifi.node'),
  ];

  for (const addonPath of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _wifiNative = require(addonPath);
      if (_wifiNative) return _wifiNative;
    } catch { /* try next */ }
  }
  _wifiNative = null;
  return _wifiNative;
}

// ─── SSID detection ────────────────────────────────────────────────────────

/**
 * Get the current Wi-Fi SSID on macOS.
 *
 * Method 1: native CoreWLAN addon running in-process — inherits Electron's
 *   Location Services grant. This is the only reliable method on macOS 14+
 *   because all child processes (execSync) are denied SSID access by macOS
 *   regardless of what permission the parent app has been granted.
 * Method 2: scutil — works on macOS 13 and older where configd still exposes
 *   SSID_STR without a location check.
 */
function getMacSSID(): string | null {
  // Method 1: native CoreWLAN addon (in-process, uses Electron's location grant)
  const native = getWifiNative();
  if (native) {
    try {
      const ssid: string | null = native.getSSID();
      if (ssid) return ssid;
    } catch { /* fall through */ }
  }

  // Method 2: scutil (macOS 13 and older)
  try {
    const out = execSync('networksetup -listallhardwareports', { timeout: 5000, encoding: 'utf-8' });
    const lines = out.split('\n');
    let iface = 'en0';
    for (let i = 0; i < lines.length; i++) {
      if (/wi-fi|airport/i.test(lines[i])) {
        const m = lines[i + 1]?.match(/Device:\s+(\S+)/);
        if (m) { iface = m[1]; break; }
      }
    }
    const script = `open\nget State:/Network/Interface/${iface}/AirPort\nd.show\n`;
    const scutilOut = execSync('scutil', { input: script, timeout: 3000, encoding: 'utf-8' });
    // Use [^\S\n]* (horizontal whitespace only) so \s* doesn't consume the newline
    // and bleed into the next field line.
    const m = scutilOut.match(/^\s*SSID_STR[^\S\n]*:[^\S\n]*(.+)?$/m);
    if (m && m[1]) {
      const ssid = m[1].trim();
      if (ssid) return ssid;
    }
  } catch { /* fall through */ }

  return null;
}

/**
 * Get the current Wi-Fi SSID on Linux using nmcli or iwgetid.
 */
function getLinuxSSID(): string | null {
  // Method 1: nmcli (NetworkManager — most Linux distros)
  try {
    const out = execSync("nmcli -t -f active,ssid dev wifi 2>/dev/null | grep '^yes:' | cut -d: -f2", {
      timeout: 5000, encoding: 'utf-8',
    });
    const ssid = out.trim();
    if (ssid) return ssid;
  } catch { /* fall through */ }

  // Method 2: iwgetid
  try {
    const out = execSync('iwgetid -r 2>/dev/null', { timeout: 5000, encoding: 'utf-8' });
    const ssid = out.trim();
    if (ssid) return ssid;
  } catch { /* fall through */ }

  return null;
}

/**
 * Get the current Wi-Fi SSID on Windows using netsh.
 */
function getWindowsSSID(): string | null {
  try {
    const out = execSync('netsh wlan show interfaces', { timeout: 5000, encoding: 'utf-8' });
    // Anchor with ^ so "BSSID" lines (which also contain "SSID") don't match
    const m = out.match(/^\s*SSID\s*:\s*(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return null;
}

/**
 * Returns the current Wi-Fi SSID, or null if not connected / unknown.
 * Works on macOS (all versions), Linux, and Windows.
 */
function getCurrentSSID(): string | null {
  const platform = os.platform();
  if (platform === 'darwin') return getMacSSID();
  if (platform === 'linux') return getLinuxSSID();
  if (platform === 'win32') return getWindowsSSID();
  return null;
}

// ─── VPN detection ─────────────────────────────────────────────────────────

/**
 * Detect whether an IBM VPN is currently connected.
 * Supports macOS, Windows, and Linux.
 *
 * macOS / Linux — Cisco Secure Client CLI primary, tunnel interface IP fallback.
 * Windows       — Cisco Secure Client CLI primary, Get-VpnConnection fallback.
 */
export function isConnectedToIBMVpn(): boolean {
  const platform = os.platform();

  // ── Cisco Secure Client CLI (works on macOS and Linux) ──────────────────
  if (platform === 'darwin' || platform === 'linux') {
    try {
      const out = execSync('/opt/cisco/secureclient/bin/vpn state', {
        timeout: 4000, encoding: 'utf-8',
      });
      if (/state:\s*Connected/i.test(out)) {
        getLogger().info('VPN check: Cisco Secure Client connected');
        return true;
      }
    } catch { /* not installed — fall through */ }
  }

  // ── Cisco Secure Client CLI (Windows) ───────────────────────────────────
  if (platform === 'win32') {
    try {
      const winPath = 'C:\\Program Files (x86)\\Cisco\\Cisco Secure Client\\vpncli.exe';
      const out = execSync(`"${winPath}" state`, { timeout: 4000, encoding: 'utf-8' });
      if (/state:\s*Connected/i.test(out)) {
        getLogger().info('VPN check: Cisco Secure Client connected');
        return true;
      }
    } catch { /* not installed — fall through */ }

    // Windows fallback: PowerShell Get-VpnConnection
    try {
      const out = execSync(
        'powershell -NoProfile -Command "Get-VpnConnection | Where-Object {$_.ConnectionStatus -eq \'Connected\'} | Select-Object -ExpandProperty Name"',
        { timeout: 5000, encoding: 'utf-8' },
      );
      if (out.trim()) {
        getLogger().info(`VPN check: VPN connection active — ${out.trim()}`);
        return true;
      }
    } catch { /* fall through */ }
  }

  // ── Tunnel interface IP fallback (macOS and Linux) ───────────────────────
  // If Cisco CLI is absent, look for a utun/ppp/tun interface carrying a
  // corporate-range IP (9.x.x.x). This catches any VPN client, not just Cisco.
  if (platform === 'darwin' || platform === 'linux') {
    try {
      const cmd = platform === 'darwin' ? 'ifconfig' : 'ip addr';
      const out = execSync(cmd, { timeout: 3000, encoding: 'utf-8' });
      // Split on lines that start a new interface block
      const ifaceBlocks = out.split(/^(?=\S|\s{0,2}\d+:)/m);
      for (const block of ifaceBlocks) {
        // Only consider tunnel-type interfaces
        if (!/^(utun|ppp|tun|ipsec|vpn)/i.test(block.trim())) continue;
        const inetMatch = block.match(/inet\s+(9\.\d+\.\d+\.\d+)/);
        if (inetMatch) {
          getLogger().info(`VPN check: IBM corporate IP ${inetMatch[1]} on tunnel interface`);
          return true;
        }
      }
    } catch { /* fall through */ }
  }

  return false;
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * Returns true if the device is currently connected to either IBM Wi-Fi SSID.
 * VPN connection alone does NOT count as "at the office" — only the physical
 * IBM Wi-Fi SSIDs trigger Office status.
 *
 * Returns a Promise so callers can uniformly await it (the underlying calls
 * are synchronous but async wrapping makes the engine interface consistent
 * across platforms and future async backends).
 */
export async function isConnectedToIBMWifi(config: AppConfig): Promise<boolean> {
  const settings = getSettings();
  const primarySSID = settings.primarySSID || config.ibmWifi.primarySSID;
  const guestSSID = settings.guestSSID || config.ibmWifi.guestSSID;

  // Log VPN state for context only — does not affect the Office decision
  const vpnConnected = isConnectedToIBMVpn();

  try {
    const currentSSID = getCurrentSSID();
    const connected = currentSSID !== null && (currentSSID === primarySSID || currentSSID === guestSSID);
    getLogger().info(
      `Wi-Fi check: SSID="${currentSSID ?? 'none'}", connected=${connected}, ` +
      `IBM SSIDs=[${primarySSID}, ${guestSSID}], VPN=${vpnConnected}`
    );
    return connected;
  } catch (err) {
    getLogger().error(`Wi-Fi check failed: ${err}`);
    return false;
  }
}
