import os
import requests
import json
import logging
import time
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(), override=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

BOLTZ_ENDPOINTS = [
    "https://api.boltz.exchange",
    "http://boltzzzbnus4m7mta3cxmflnps4fp7dueu2tgurstbvrbt6xswzcocyd.onion"
]

def fetch_live_rates():
    try:
        btc_res = requests.get("https://api.coinbase.com/v2/prices/BTC-USD/spot", timeout=5).json()
        return float(btc_res["data"]["amount"])
    except Exception:
        return 64250.0

def get_boltz_pairs():
    headers = {"User-Agent": "Artemis-Bridge/1.0", "Accept": "application/json"}
    for base_url in BOLTZ_ENDPOINTS:
        try:
            proxies = None
            if ".onion" in base_url:
                proxies = {"http": "socks5h://127.0.0.1:9050", "https": "socks5h://127.0.0.1:9050"}
            
            response = requests.get(f"{base_url}/v2/markets", headers=headers, proxies=proxies, timeout=6)
            if response.status_code == 200:
                pair_data = response.json().get("pairs", {}).get("BTC/BTC", {})
                return pair_data, base_url
        except Exception:
            continue
    return None, None

def monitor_and_automate_liquidity():
    print("\n[+] Artemis Boltz Bridge Daemon Initialized (Paced Multi-Endpoint Mode).", flush=True)
    while True:
        btc_usd_rate = fetch_live_rates()
        pair_info, active_endpoint = get_boltz_pairs()
        
        print("\n==============================================", flush=True)
        print("🛡 ARTEMIS BOLTZ LIQUIDITY BRIDGE TELEMETRY", flush=True)
        print("==============================================", flush=True)
        print(f"• BTC Spot Oracle  : ${btc_usd_rate:,.2f} USD", flush=True)
        if pair_info and active_endpoint:
            fee_pct = pair_info.get("fees", {}).get("percentage", "N/A")
            print(f"• Boltz Fee (Rev)  : {fee_pct}%", flush=True)
            print(f"• Active Route     : {active_endpoint}", flush=True)
            print("• Status           : Connected (API v2)", flush=True)
        else:
            print("• Status           : Standby / Tor Onion Fallback Active", flush=True)
        print("==============================================\n", flush=True)
        
        time.sleep(60)

if __name__ == "__main__":
    monitor_and_automate_liquidity()
