#!/bin/bash
read -p "Enter your exact Mastercard API endpoint path (e.g., /processing/v1/cards): " custom_path
grep -v "MC_API_PATH" .env > .env.tmp && mv .env.tmp .env
echo "MC_API_PATH=$custom_path" >> .env
echo "✅ Updated .env with path: $custom_path"
