import { cn } from "cn";

const SIZE = {
  sm: "size-8",
  md: "size-12",
  lg: "size-20",
} as const;

const TEXT_SIZE = {
  sm: "text-[8px]",
  md: "text-xs",
  lg: "text-lg",
} as const;

export type ClubCrestSize = keyof typeof SIZE;

/**
 * Server-safe. Renders the club's uploaded crest image when it has one, else a colored shield
 * (the same clip-path shape as the FUT player card) filled with the primary color and the
 * abbreviation in the secondary color -- so a club always has *some* visual identity, uploaded or
 * not. `crestUrl` is the already-resolved public Storage URL (with its cache-busting `?v=`), not
 * a raw `crest_path`, so this component never needs a Supabase client of its own.
 */
export function ClubCrest({
  crestUrl,
  primaryColor,
  secondaryColor,
  shortName,
  name,
  size = "md",
  className,
}: {
  crestUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  shortName: string;
  name: string;
  size?: ClubCrestSize;
  className?: string;
}) {
  if (crestUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- dynamic per-group Supabase Storage URL
    return <img src={crestUrl} alt={name} className={cn(SIZE[size], "shrink-0 object-contain", className)} />;
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={cn(SIZE[size], "fut-shield flex shrink-0 items-center justify-center font-bold", className)}
      style={{ backgroundColor: primaryColor, color: secondaryColor }}
    >
      <span className={TEXT_SIZE[size]}>{shortName}</span>
    </div>
  );
}
