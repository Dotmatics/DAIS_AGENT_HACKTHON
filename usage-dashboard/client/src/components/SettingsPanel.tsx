import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@databricks/appkit-ui/react';
import { useGapThreshold } from '../context/GapThresholdContext';

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { threshold, setThreshold } = useGapThreshold();
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle className="font-serif text-[#0B2026]">Dashboard Settings</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Coverage Gap Threshold
            </label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="flex-1 accent-[#0B2026]"
              />
              <span className="text-sm font-mono font-bold text-[#0B2026] w-14 text-right">
                {threshold} km
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground font-mono mt-1">
              <span>10 km</span><span>100 km</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Sessions where the nearest facility is farther than this are flagged as coverage gaps.
            Affects gap counts on Overview, Districts, and Sessions pages.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
