#!/usr/bin/env bash
# Block until a task in .orchestra/tasks matches the wanted status (and assignee).
#
# Usage: bash .orchestra/wait-for-task.sh <status[,status2,...]> [assignee] [--timeout SECONDS] [--interval SECONDS] [--seen FILE]
#   Prints the path of the first matching task (sorted by id) and exits 0.
#   For status "todo", only tasks whose depends_on are all "verified" match.
#   --seen FILE: task ids listed in FILE (one per line) are ignored (FATHER uses this to skip already-handled results).
#   Exit 1 on timeout (default 540s, so it fits inside a 10-minute tool call: just call it again).
#   Exit 2 if .orchestra/DONE exists.
#   Exit 3 if .orchestra/PAUSE exists (write your handoff file, then stop — see CLAUDE.md "Team protocol").
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
TASKS="$DIR/tasks"

statuses=""; assignee=""; timeout=540; interval=15; seen=""
while [ $# -gt 0 ]; do
  case "$1" in
    --timeout) timeout="$2"; shift 2 ;;
    --interval) interval="$2"; shift 2 ;;
    --seen) seen="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *)
      if [ -z "$statuses" ]; then statuses="$1"
      elif [ -z "$assignee" ]; then assignee="$1"
      fi
      shift ;;
  esac
done

if [ -z "$statuses" ]; then
  echo "usage: wait-for-task.sh <status[,status2]> [assignee] [--timeout S] [--seen FILE]" >&2
  exit 64
fi

# Print the value of a frontmatter key (first --- block), stripping quotes and CR.
fm() {
  awk -v k="$2" '
    { sub(/\r$/, "") }
    NR == 1 { if ($0 != "---") exit; next }
    $0 == "---" { exit }
    {
      i = index($0, ":"); if (!i) next
      key = substr($0, 1, i - 1); gsub(/^[ \t]+|[ \t]+$/, "", key)
      if (key != k) next
      v = substr($0, i + 1); gsub(/^[ \t]+|[ \t]+$/, "", v); gsub(/^["\x27]|["\x27]$/, "", v)
      print v; exit
    }' "$1"
}

deps_verified() {
  local deps d f
  deps="$(fm "$1" depends_on | tr -d '[]"'"'" | tr ',' ' ')"
  for d in $deps; do
    [ -z "$d" ] && continue
    f="$TASKS/$d.md"
    [ -f "$f" ] || return 1
    [ "$(fm "$f" status)" = "verified" ] || return 1
  done
  return 0
}

is_seen() {
  [ -n "$seen" ] && [ -f "$seen" ] && tr -d '\r' < "$seen" | grep -qx "$1"
}

status_wanted() {
  case ",$statuses," in *",$1,"*) return 0 ;; esac
  return 1
}

start=$(date +%s)
while :; do
  if [ -f "$DIR/DONE" ]; then echo "DONE"; exit 2; fi
  if [ -f "$DIR/PAUSE" ]; then echo "PAUSE"; exit 3; fi

  if [ -d "$TASKS" ]; then
    for f in $(ls "$TASKS"/T-*.md 2>/dev/null | sort); do
      st="$(fm "$f" status)"
      status_wanted "$st" || continue
      if [ -n "$assignee" ] && [ "$(fm "$f" assignee)" != "$assignee" ]; then continue; fi
      id="$(fm "$f" id)"; [ -z "$id" ] && id="$(basename "$f" .md)"
      is_seen "$id" && continue
      if [ "$st" = "todo" ] && ! deps_verified "$f"; then continue; fi
      echo "$f"
      exit 0
    done
  fi

  now=$(date +%s)
  if [ $((now - start)) -ge "$timeout" ]; then echo "TIMEOUT"; exit 1; fi
  sleep "$interval"
done
