// Pure UI-state helpers for the squad editor. Deliberately separate from the engine's
// SquadAssignment (slot -> full SquadPlayer): the editor only needs to track slot -> playerId
// while the user is dragging players around, and looks the rest up from the loaded context.
import type { PositionCode } from "@/lib/rating/positions";
import type { SquadContext } from "./view";
import type { Formation } from "./formations";
import { slotOvr } from "./rating";

/** slot index -> playerId. */
export type EditorAssignment = ReadonlyMap<number, string>;

export function setSlot(assignment: EditorAssignment, slot: number, playerId: string): EditorAssignment {
  const next = new Map(assignment);
  for (const [s, id] of next) {
    if (id === playerId && s !== slot) next.delete(s);
  }
  next.set(slot, playerId);
  return next;
}

export function clearSlot(assignment: EditorAssignment, slot: number): EditorAssignment {
  if (!assignment.has(slot)) return assignment;
  const next = new Map(assignment);
  next.delete(slot);
  return next;
}

/** Keeps only the slots that still exist in the new formation. */
export function changeFormation(assignment: EditorAssignment, formation: Formation): EditorAssignment {
  const slots = new Set(formation.slots.map((s) => s.slot));
  const next = new Map<number, string>();
  for (const [slot, playerId] of assignment) {
    if (slots.has(slot)) next.set(slot, playerId);
  }
  return next;
}

export type SlotCandidateFit = "primary" | "alt" | "other";

export interface SlotCandidate {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  ovr: number;
  fit: SlotCandidateFit;
}

/** Group players eligible for a slot: not already placed elsewhere, sorted best OVR at that slot's position first. */
export function candidatesForSlot(
  players: SquadContext["players"],
  assignment: EditorAssignment,
  position: PositionCode,
): SlotCandidate[] {
  const placedIds = new Set(assignment.values());
  const candidates: SlotCandidate[] = [];
  for (const player of players.values()) {
    if (placedIds.has(player.playerId)) continue;
    candidates.push({
      playerId: player.playerId,
      name: player.name,
      avatarUrl: player.avatarUrl,
      ovr: slotOvr(player, position),
      fit: player.primaryPosition === position ? "primary" : player.altPositions.includes(position) ? "alt" : "other",
    });
  }
  return candidates.sort((a, b) => b.ovr - a.ovr);
}
