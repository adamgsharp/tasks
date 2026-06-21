'use client'

export type Energy = 'high' | 'mid' | 'low'

const OPTIONS: { value: Energy; emoji: string; label: string }[] = [
  { value: 'high', emoji: '🔥', label: 'high energy' },
  { value: 'mid', emoji: '😐', label: 'mid energy' },
  { value: 'low', emoji: '🪫', label: 'low energy' },
]

interface Props {
  energy: Energy
  onChange: (energy: Energy) => void
}

export default function EngineCheck({ energy, onChange }: Props) {
  return (
    <div className="flex gap-0.5" role="group" aria-label="Energy level">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-label={opt.label}
          aria-pressed={energy === opt.value}
          className={`rounded-lg px-2.5 py-1.5 text-lg leading-none transition-all ${
            energy === opt.value
              ? 'bg-stone-100 dark:bg-stone-800 scale-110'
              : 'opacity-35 hover:opacity-60'
          }`}
        >
          {opt.emoji}
        </button>
      ))}
    </div>
  )
}
