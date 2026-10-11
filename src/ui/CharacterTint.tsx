import { useMemo, useState, type CSSProperties } from 'react'
import { hslToCss, tintToBody, tintToGlow, writeTint } from '../character/tint.ts'

/** First visit: pick a continuous tint for your glint. No name — only light. */
export function CharacterTint({ onChosen }: { onChosen: (tint: number) => void }) {
  const [tint, setTint] = useState(() => Math.random())
  const body = useMemo(() => tintToBody(tint), [tint])
  const glow = useMemo(() => tintToGlow(tint), [tint])

  return (
    <div className="tint-gate" role="dialog" aria-label="Choose your glint">
      <div className="tint-sky" aria-hidden="true" />
      <div
        className="tint-preview"
        style={
          {
            '--body': hslToCss(body),
            '--glow': hslToCss(glow),
          } as CSSProperties
        }
      >
        <span className="tint-glow" />
        <span className="tint-body" />
      </div>
      <label className="tint-slider">
        <span className="tint-rail" aria-hidden="true" />
        <input
          type="range"
          min={0}
          max={1}
          step="any"
          value={tint}
          aria-label="Glint color"
          onChange={(event) => setTint(Number(event.target.value))}
        />
      </label>
      <button
        type="button"
        className="tint-go"
        aria-label="Continue"
        onClick={() => onChosen(writeTint(tint))}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.2 4.2L19 7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
