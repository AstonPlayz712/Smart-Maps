interface Props {
  onOpen: () => void;
  active?: boolean;
}

/**
 * Single entry point into the media drawer (Spotify + Moises). Matches the
 * flat / hairline / uppercase chip language used elsewhere in the top
 * overlay.
 */
export default function MediaChip({ onOpen, active }: Props) {
  return (
    <button
      type="button"
      className="media-chip"
      onClick={onOpen}
      aria-pressed={!!active}
      title="Media services"
    >
      <span className="media-chip-icon" aria-hidden>♪</span>
      <span className="media-chip-label">Media</span>
    </button>
  );
}
