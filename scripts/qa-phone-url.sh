#!/usr/bin/env bash
set -euo pipefail

interface="$(route -n get default | awk '/interface:/{print $2}')"
ip_address="$(ipconfig getifaddr "$interface")"
local_name="$(scutil --get LocalHostName | tr '[:upper:]' '[:lower:]')"

printf 'Stable local name: http://%s.local:3321/login\n' "$local_name"
printf 'Current Wi-Fi IP:  http://%s:3321/login\n' "$ip_address"
