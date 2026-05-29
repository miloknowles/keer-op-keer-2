import { cn } from "@/lib/utils";

interface ResourceTracksProps {
  hearts: number;
  boxesUnlocked: number;
  boxesSpent: number;
  wildcards: number;
}

export function ResourceTracks({
  hearts,
  boxesUnlocked,
  boxesSpent,
  wildcards,
}: ResourceTracksProps) {
  const boxesAvailable = Math.max(0, boxesUnlocked - boxesSpent);

  return (
    <div className="flex flex-col gap-2">
      <ResourceCount
        label="Hearts"
        count={hearts}
        icon="❤️"
        shape="rounded-full"
        activeClassName="bg-red-100 text-red-600 border border-red-200"
        inactiveClassName="bg-gray-100 border border-gray-200 opacity-30"
      />
      <ResourceCount
        label="Boxes"
        count={boxesAvailable}
        icon="📦"
        shape="rounded"
        activeClassName="bg-amber-700 text-white"
        inactiveClassName="bg-gray-100 border border-gray-200 opacity-30"
      />
      <ResourceCount
        label="Wild (?/✕)"
        count={wildcards}
        icon="?"
        shape="rounded"
        activeClassName="bg-gray-100 text-gray-700 border border-gray-300"
        inactiveClassName="bg-gray-100 border border-gray-300 text-gray-300"
      />
    </div>
  );
}

interface ResourceCountProps {
  label: string;
  count: number;
  icon: string;
  shape: string;
  activeClassName: string;
  inactiveClassName: string;
}

function ResourceCount({
  label,
  count,
  icon,
  shape,
  activeClassName,
  inactiveClassName,
}: ResourceCountProps) {
  const active = count > 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        {label}
      </div>
      <div className="flex min-w-14 items-center gap-1.5">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center text-sm font-bold",
            shape,
            active ? activeClassName : inactiveClassName,
          )}
        >
          {icon}
        </div>
        <div className="min-w-4 text-right text-xs font-semibold text-gray-500">
          {count}
        </div>
      </div>
    </div>
  );
}
