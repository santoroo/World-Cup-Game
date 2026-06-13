import { useEffect, useState } from 'react';

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

/** Animated die face. `rolling` cycles random faces; otherwise shows `value`. */
export function Dice({ value, rolling, size = 64 }: { value: number; rolling?: boolean; size?: number }) {
  const [face, setFace] = useState(value);

  useEffect(() => {
    if (!rolling) {
      setFace(value);
      return;
    }
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 90);
    return () => clearInterval(id);
  }, [rolling, value]);

  const pips = PIPS[face] ?? PIPS[1];
  return (
    <div
      className={`grid grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl border-2 border-white/70 bg-white p-2 shadow-xl ${rolling ? 'animate-dice-roll' : ''}`}
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const on = pips.some(([r, c]) => r === row && c === col);
        return (
          <div key={i} className="flex items-center justify-center">
            {on && <span className="block h-2 w-2 rounded-full bg-pitch-900 sm:h-2.5 sm:w-2.5" />}
          </div>
        );
      })}
    </div>
  );
}
