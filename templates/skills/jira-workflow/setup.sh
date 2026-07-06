#!/usr/bin/env bash
# Interactive setup wizard for the jira-workflow Copilot CLI skill.
#
# Saves non-sensitive settings (baseUrl, email) to ~/.devex/jira-config.json
# with permissions 600.  The API token is NEVER written to disk — the wizard
# prints shell-profile instructions so you can set it yourself.
#
# macOS users are offered the option to store the token in the system Keychain
# instead of (or in addition to) the shell-profile approach.

set -euo pipefail

CONFIG_FILE="${HOME}/.devex/jira-config.json"
DEVEX_DIR="${HOME}/.devex"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Jira Workflow Skill — Setup Wizard          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ---------- base URL ----------

read -rp "Jira Cloud base URL (e.g. https://yourcompany.atlassian.net): " base_url
base_url="${base_url%/}"
if [[ ! "$base_url" =~ ^https?:// ]]; then
    echo "Error: URL must start with https://" >&2
    exit 1
fi

# ---------- email ----------

read -rp "Jira email address: " email
if [[ ! "$email" =~ @ ]]; then
    echo "Error: must be a valid email address" >&2
    exit 1
fi

# ---------- save non-sensitive config ----------

mkdir -p "$DEVEX_DIR"

python3 - <<EOF
import json, os
f = '${CONFIG_FILE}'
d = json.load(open(f)) if os.path.exists(f) else {}
d['baseUrl'] = '${base_url}'
d['email'] = '${email}'
json.dump(d, open(f, 'w'), indent=2)
EOF

chmod 600 "$CONFIG_FILE"
echo ""
echo "✓ Saved non-sensitive config to ${CONFIG_FILE} (permissions: 600)"

# ---------- API token ----------

echo ""
echo "Next: your Jira API token."
echo "  Create one at: https://id.atlassian.com/manage/api-tokens"
echo ""
read -rsp "Paste your API token (input hidden): " api_token
echo ""

if [[ -z "$api_token" ]]; then
    echo "Warning: no token entered — skipping token setup." >&2
    exit 0
fi

# ---------- macOS Keychain option ----------

stored_in_keychain=false
if command -v security &>/dev/null; then
    echo ""
    read -rp "Store token in macOS Keychain? (recommended — no shell profile needed) [Y/n]: " use_keychain
    if [[ "${use_keychain:-y}" =~ ^[Yy]?$ ]]; then
        security add-generic-password -U -s "jira-api-token" -a "$email" -w "$api_token" 2>/dev/null && {
            echo "✓ Token stored in macOS Keychain under service 'jira-api-token'."
            echo "  fetch.sh will retrieve it automatically."
            stored_in_keychain=true
        } || echo "Warning: Keychain storage failed — falling back to env var instructions."
    fi
fi

# ---------- shell profile instructions ----------

if [[ "$stored_in_keychain" == "false" ]]; then
    shell_profile="${HOME}/.zshrc"
    if [[ "${SHELL:-}" == *bash* ]]; then
        shell_profile="${HOME}/.bashrc"
    fi

    echo ""
    echo "────────────────────────────────────────────"
    echo "Add the following line to ${shell_profile}:"
    echo ""
    echo "  export JIRA_API_TOKEN='${api_token}'"
    echo ""
    echo "Then reload your shell:"
    echo "  source ${shell_profile}"
    echo "────────────────────────────────────────────"
fi

echo ""
echo "Setup complete. Test it with:"
echo "  ~/.copilot/skills/jira-workflow/fetch.sh PROJ-1"
echo ""
