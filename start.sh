#!/bin/bash
# KeyGate — start backend API server

echo ""
echo "  ██╗  ██╗███████╗██╗   ██╗ ██████╗  █████╗ ████████╗███████╗"
echo "  ██║ ██╔╝██╔════╝╚██╗ ██╔╝██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝"
echo "  █████╔╝ █████╗   ╚████╔╝ ██║  ███╗███████║   ██║   █████╗  "
echo "  ██╔═██╗ ██╔══╝    ╚██╔╝  ██║   ██║██╔══██║   ██║   ██╔══╝  "
echo "  ██║  ██╗███████╗   ██║   ╚██████╔╝██║  ██║   ██║   ███████╗"
echo "  ╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝"
echo ""
echo "  API Access Management Platform"
echo ""
echo "  Starting backend API on http://localhost:3001"
echo "  Open frontend/index.html in your browser to get started"
echo ""

cd "$(dirname "$0")/backend"
node server.js
