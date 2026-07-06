#!/usr/bin/env bash
# Fetch a Jira Cloud ticket and print its JSON for Copilot CLI to process.
#
# Usage: fetch.sh <TICKET-KEY>   (e.g.  fetch.sh PROJ-123)
#
# Credential resolution order (non-sensitive: URL, email):
#   1. Environment variables: JIRA_BASE_URL, JIRA_EMAIL
#   2. ~/.devex/jira-config.json
#
# Token (JIRA_API_TOKEN) — never stored in any file:
#   1. $JIRA_API_TOKEN env var
#   2. macOS Keychain entry named "jira-api-token"  (fallback only)
#
# To configure, run:
#   ~/.copilot/skills/jira-workflow/setup.sh
#
# Requires: bash, curl, python3, base64

set -euo pipefail

CONFIG_FILE="${HOME}/.devex/jira-config.json"
TICKET_KEY="${1:-}"

# ---------- helpers ----------

read_config() {
    local key="$1"
    if [[ -f "$CONFIG_FILE" ]]; then
        python3 -c "
import json, sys
try:
    d = json.load(open('${CONFIG_FILE}'))
    print(d.get('${key}', ''))
except Exception:
    print('')
" 2>/dev/null || echo ""
    fi
}

# ---------- resolve credentials ----------

JIRA_BASE_URL="${JIRA_BASE_URL:-$(read_config baseUrl)}"
JIRA_EMAIL="${JIRA_EMAIL:-$(read_config email)}"

# Token: env var only; macOS Keychain as silent fallback
if [[ -z "${JIRA_API_TOKEN:-}" ]] && command -v security &>/dev/null; then
    JIRA_API_TOKEN="$(security find-generic-password -s "jira-api-token" -w 2>/dev/null || true)"
fi

# ---------- fail fast if any credential is missing ----------

missing=()
[[ -z "${JIRA_BASE_URL:-}" ]] && missing+=("JIRA_BASE_URL")
[[ -z "${JIRA_EMAIL:-}"    ]] && missing+=("JIRA_EMAIL")
[[ -z "${JIRA_API_TOKEN:-}"]] && missing+=("JIRA_API_TOKEN")

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Error: missing Jira credentials: ${missing[*]}" >&2
    echo "" >&2
    echo "Quick fix — set env vars:" >&2
    echo "  export JIRA_BASE_URL='https://yourcompany.atlassian.net'" >&2
    echo "  export JIRA_EMAIL='you@company.com'" >&2
    echo "  export JIRA_API_TOKEN='<token>'" >&2
    echo "" >&2
    echo "Or run the setup wizard:" >&2
    echo "  ~/.copilot/skills/jira-workflow/setup.sh" >&2
    exit 1
fi

# ---------- validate ticket key ----------

if [[ -z "$TICKET_KEY" ]]; then
    echo "Usage: fetch.sh <TICKET-KEY>  (e.g. PROJ-123)" >&2
    exit 1
fi

if ! echo "$TICKET_KEY" | grep -qE '^[A-Z][A-Z0-9]*-[0-9]+$'; then
    echo "Error: invalid ticket key '${TICKET_KEY}'. Expected format: PROJ-123" >&2
    exit 1
fi

# ---------- fetch ----------

BASE_URL="${JIRA_BASE_URL%/}"
FIELDS="summary,description,status,issuetype,priority,assignee,reporter,labels,comment,fixVersions"
AUTH="$(printf '%s:%s' "${JIRA_EMAIL}" "${JIRA_API_TOKEN}" | base64 | tr -d '[:space:]')"

response="$(curl -sSL \
    -H "Authorization: Basic ${AUTH}" \
    -H "Accept: application/json" \
    -w "\n%{http_code}" \
    "${BASE_URL}/rest/api/3/issue/${TICKET_KEY}?fields=${FIELDS}")"

http_code="$(echo "$response" | tail -1)"
body="$(echo "$response" | head -n -1)"

if [[ "$http_code" -lt 200 ]] || [[ "$http_code" -ge 300 ]]; then
    echo "Error: Jira API returned HTTP ${http_code} for ${TICKET_KEY}" >&2
    echo "$body" >&2
    exit 1
fi

echo "$body"
