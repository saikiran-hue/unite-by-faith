interface Seat {
  id: string;
  name: string;
  avatarUrl: string;
  isYou?: boolean;
}

interface RoundTableProps {
  seats: Seat[];
  maxSeats: number;
  size?: number;
  className?: string;
}

/**
 * A pod drawn as people around a table: one seat per member,
 * dashed seats for open places.
 */
export function RoundTable({
  seats,
  maxSeats,
  size = 160,
  className,
}: RoundTableProps) {
  const total = Math.max(maxSeats, seats.length);
  const avatar = Math.round(size * 0.28);
  const orbit = size / 2 - avatar / 2 - 2;
  const tableSize = orbit * 2 - avatar * 0.35;
  const open = total - seats.length;

  return (
    <div
      className={`relative shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${seats.map((x) => (x.isYou ? `${x.name} (you)` : x.name)).join(', ')}. ${seats.length} of ${total} seats filled${open > 0 ? `, ${open} open` : ''}`}
    >
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-ink-900 bg-ink-50"
        style={{ width: tableSize, height: tableSize }}
      >
        <span className="font-display text-lg font-bold tabular-nums text-ink-900">
          {seats.length}/{total}
        </span>
      </div>
      {Array.from({ length: total }).map((_, i) => {
        const angle = ((-90 + (360 / total) * i + (total === 4 ? 45 : 0)) * Math.PI) / 180;
        const x = size / 2 + orbit * Math.cos(angle);
        const y = size / 2 + orbit * Math.sin(angle);
        const seat = seats[i];
        return (
          <div
            key={seat?.id ?? `open-${i}`}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y, width: avatar, height: avatar }}
          >
            {seat ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={seat.avatarUrl}
                alt=""
                className={`block h-full w-full rounded-full object-cover ring-offset-2 ring-offset-white ${
                  seat.isYou ? 'ring-[3px] ring-ink-900' : 'ring-[1.5px] ring-ink-400'
                }`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full border-[1.5px] border-dashed border-ink-400 bg-white text-xs font-semibold text-ink-500">
                Open
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
