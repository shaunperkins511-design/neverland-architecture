import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

// Explicitly point to your local Tor SOCKS5 proxy
const agent = new SocksProxyAgent('socks5h://127.0.0.1:9050');

async function verifyTor() {
  try {
    console.log("🔍 Testing connection through Tor proxy...");
    const response = await axios.get('https://check.torproject.org/api/ip', {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
      timeout: 15000
    });
    console.log("🔒 Tor Verification Result:", response.data);
  } catch (error) {
    console.error("❌ Tor routing error:", error.message);
  }
}

verifyTor();
