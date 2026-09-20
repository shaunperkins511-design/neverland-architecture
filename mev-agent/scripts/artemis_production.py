import os
import time
import threading
import logging
import requests
from flask import Flask, jsonify
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(), override=True)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logging.getLogger("werkzeug").setLevel(logging.WARNING)

app = Flask(__name__)

# Enhanced state capturing options volatility and derivatives metrics
STATE = {
    "btc_spot": 0.0,
    "implied_volatility": 0.0,
    "put_call_ratio": 0.0,
    "gamma_exposure_state": "Neutral",
    "treasury_status": "Syncing",
    "active_options_strategies": 0
}

@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "environment": "production-options-quant",
        "service": "Artemis Options & Volatility Engine",
        "metrics": STATE,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    }), 200

def start_production_server():
    port = int(os.getenv("PORT", 5000))
    try:
        app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False, threaded=True)
    except Exception as e:
        logging.error(f"[-] WSGI Server bind error (handled): {e}")

def fetch_options_and_derivatives():
    """Fetches spot reference and simulates options chain metrics (IV, Put/Call Skew, Gamma)."""
    try:
        btc_res = requests.get("https://api.coinbase.com/v2/prices/BTC-USD/spot", timeout=4).json()
        STATE["btc_spot"] = float(btc_res["data"]["amount"])
    except Exception:
        STATE["btc_spot"] = 81000.0

    try:
        # In production, query Deribit or options analytics APIs for live IV and Put/Call data
        STATE["implied_volatility"] = 52.4  # % IV index
        STATE["put_call_ratio"] = 0.68      # Bullish skew if < 0.70
        
        if STATE["put_call_ratio"] < 0.75:
            STATE["gamma_exposure_state"] = "Positive Gamma / Call Heavy"
            STATE["active_options_strategies"] = 2
        else:
            STATE["gamma_exposure_state"] = "Negative Gamma / Defensive"
            STATE["active_options_strategies"] = 0

        logging.info(f"[*] Options Quant | Spot: ${STATE['btc_spot']:,.2f} | IV: {STATE['implied_volatility']}% | P/C Ratio: {STATE['put_call_ratio']} | State: {STATE['gamma_exposure_state']}")
    except Exception as e:
        logging.error(f"[-] Options Analytics Error: {e}")

def options_execution_loop():
    logging.info("[+] Artemis Options & Volatility Engine Active.")
    while True:
        fetch_options_and_derivatives()
        time.sleep(30)

if __name__ == "__main__":
    server_thread = threading.Thread(target=start_production_server, daemon=True)
    server_thread.start()
    options_execution_loop()
