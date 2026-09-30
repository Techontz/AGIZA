#!/bin/zsh
# Stop the AGIZA stack started by start-local.sh (only AGIZA's ports; other projects are left alone).
for port in 3000 3200 8765; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)
  [[ -n "$pids" ]] && kill $pids && echo "stopped :$port"
done
if [[ "$1" == "--db" ]]; then
  pid=$(lsof -tiTCP:3308 -sTCP:LISTEN 2>/dev/null); [[ -n "$pid" ]] && kill "$pid" && echo "stopped MySQL :3308"
fi
