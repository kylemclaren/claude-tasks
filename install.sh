#!/bin/bash
set -e

# claude-tasks installer
# Usage: curl -fsSL https://raw.githubusercontent.com/kylemclaren/claude-tasks/main/install.sh | bash

REPO="kylemclaren/claude-tasks"
INSTALL_DIR="${CLAUDE_TASKS_INSTALL_DIR:-$HOME/.local/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Detect OS and architecture
detect_platform() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)

    case "$OS" in
        linux)
            OS="linux"
            ;;
        darwin)
            OS="darwin"
            ;;
        mingw*|msys*|cygwin*)
            OS="windows"
            ;;
        *)
            error "Unsupported operating system: $OS"
            ;;
    esac

    case "$ARCH" in
        x86_64|amd64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac

    PLATFORM="${OS}-${ARCH}"
    info "Detected platform: $PLATFORM"
}

# Get latest release version
get_latest_version() {
    LATEST_VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$LATEST_VERSION" ]; then
        error "Failed to get latest version. No releases found yet?"
    fi
    info "Latest version: $LATEST_VERSION"
}

# Download and install
install() {
    BINARY_NAME="claude-tasks-${PLATFORM}"
    if [ "$OS" = "windows" ]; then
        BINARY_NAME="${BINARY_NAME}.exe"
        TARGET_NAME="claude-tasks.exe"
    else
        TARGET_NAME="claude-tasks"
    fi

    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_VERSION}/${BINARY_NAME}"

    info "Creating install directory: $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"

    info "Downloading binary..."
    if ! curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/$TARGET_NAME"; then
        error "Download failed. Check if release exists for $PLATFORM"
    fi
    chmod +x "$INSTALL_DIR/$TARGET_NAME"

    # On macOS, remove quarantine attribute
    if [ "$OS" = "darwin" ]; then
        info "Removing macOS quarantine..."
        xattr -cr "$INSTALL_DIR/$TARGET_NAME" 2>/dev/null || true
    fi

    info "Binary installed: $INSTALL_DIR/$TARGET_NAME"
}

# Check if install dir is in PATH
check_path() {
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        warn "$INSTALL_DIR is not in your PATH"
        echo ""
        echo "Add it to your shell config:"
        echo ""
        echo -e "  ${CYAN}# For bash (~/.bashrc)${NC}"
        echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
        echo ""
        echo -e "  ${CYAN}# For zsh (~/.zshrc)${NC}"
        echo "  export PATH=\"\$PATH:$INSTALL_DIR\""
        echo ""
    fi
}

# Setup Sprite service (if running on Sprite)
setup_sprite_service() {
    if ! command -v sprite-env &> /dev/null; then
        return 0
    fi

    info "Sprite environment detected, setting up daemon service..."

    # Check if service already exists
    if sprite-env services get claude-tasks-daemon &> /dev/null; then
        info "Stopping existing daemon service..."
        sprite-env services stop claude-tasks-daemon &> /dev/null || true
        sprite-env services delete claude-tasks-daemon &> /dev/null || true
    fi

    # Create the daemon service
    sprite-env services create claude-tasks-daemon \
        --cmd "$INSTALL_DIR/$TARGET_NAME" \
        --args daemon \
        --no-stream

    info "Daemon service created and started"
    echo ""
    echo -e "${CYAN}Sprite service commands:${NC}"
    echo "  sprite-env services list                    # List all services"
    echo "  sprite-env services stop claude-tasks-daemon   # Stop daemon"
    echo "  sprite-env services start claude-tasks-daemon  # Start daemon"
    echo ""
}

# Verify installation
verify() {
    echo ""
    echo -e "${GREEN}✓ Installation successful!${NC}"
    echo ""
    echo "Run the TUI:"
    echo -e "  ${CYAN}claude-tasks${NC}"
    echo ""
    echo "Run scheduler as daemon:"
    echo -e "  ${CYAN}claude-tasks daemon${NC}"
    echo ""
    echo "Data stored in: ~/.claude-tasks/"
    echo ""
}

main() {
    echo ""
    echo "╔═══════════════════════════════════════════╗"
    echo "║       claude-tasks installer              ║"
    echo "╚═══════════════════════════════════════════╝"
    echo ""

    detect_platform
    get_latest_version
    install
    check_path
    setup_sprite_service
    verify
}

main
