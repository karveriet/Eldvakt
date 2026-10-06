import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { locate } from '../geo/locate.ts'
import { getRoomSnapshot, send, subscribeRoom } from '../net/room.ts'
import { enableMotion, motionNeedsGesture } from '../scene/motion.ts'
import { getViewUi, stepAway, subscribeView, travelTo } from '../scene/view-store.ts'
import { VIEW_ARRIVE } from '../fire/view-distance.ts'

export function Controls() {
  const room = useSyncExternalStore(subscribeRoom, getRoomSnapshot, getRoomSnapshot)
  const view = useSyncExternalStore(subscribeView, getViewUi, getViewUi)
  const [seeking, setSeeking] = useState(false)
  const [motion, setMotion] = useState(
    () => window.matchMedia('(pointer: coarse)').matches && motionNeedsGesture(),
  )

  useEffect(() => {
    if (motion) return
    if (!window.matchMedia('(pointer: coarse)').matches) return
    void enableMotion()
  }, [motion])

  if (view.traveling) {
    return motion ? <MotionButton onGranted={() => setMotion(false)} /> : null
  }

  const seatedId = room.self.seatedFireId
  const hostedId = room.self.hostedFireId
  const seatedFire = room.fires.find((fire) => fire.id === seatedId)
  const hostedFire = room.fires.find((fire) => fire.id === hostedId)
  const focusId = view.focusId
  const canSit = Boolean(focusId) && !seatedId && (!hostedId || hostedId === focusId)

  return (
    <>
      {motion ? <MotionButton onGranted={() => setMotion(false)} /> : null}
      <div className="bar">
        {seatedId ? (
          <>
            <LogButton />
            {seatedFire?.seatedCount === 1 ? <ExtinguishButton /> : null}
            <BackButton />
          </>
        ) : (
          <>
            {canSit && focusId ? <SitButton fireId={focusId} /> : null}
            {!canSit && hostedFire ? (
              <IconButton
                label="Return to your fire"
                onClick={() => travelTo(hostedFire.lat, hostedFire.lon, VIEW_ARRIVE, hostedFire.id)}
              >
                <FlameIcon />
              </IconButton>
            ) : null}
            {!canSit && !hostedFire ? (
              <IconButton
                label="Light a fire"
                className={seeking ? 'seeking' : undefined}
                onClick={() => {
                  if (seeking) return
                  setSeeking(true)
                  void locate().then((place) => {
                    send({ type: 'light', lat: place.lat, lon: place.lon })
                    window.setTimeout(() => setSeeking(false), 800)
                  })
                }}
              >
                <FlameIcon />
              </IconButton>
            ) : null}
            {view.near || focusId ? <BackButton /> : null}
          </>
        )}
      </div>
    </>
  )
}

function SitButton({ fireId }: { fireId: string }) {
  return (
    <IconButton label="Sit at the fire" onClick={() => send({ type: 'sit', fireId })}>
      <SitIcon />
    </IconButton>
  )
}

function LogButton() {
  return (
    <IconButton label="Lay a log" onClick={() => send({ type: 'log' })}>
      <LogIcon />
    </IconButton>
  )
}

function BackButton() {
  return (
    <IconButton
      label="Step back"
      onClick={() => {
        if (getRoomSnapshot().self.seatedFireId) send({ type: 'leave' })
        stepAway()
      }}
    >
      <PlanetIcon />
    </IconButton>
  )
}

function ExtinguishButton() {
  const [progress, setProgress] = useState(0)
  const frame = useRef(0)
  const start = useRef(0)

  const stop = () => {
    cancelAnimationFrame(frame.current)
    setProgress(0)
  }

  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = performance.now()
    const loop = () => {
      const next = Math.min(1, (performance.now() - start.current) / 700)
      setProgress(next)
      if (next >= 1) {
        send({ type: 'extinguish' })
        setProgress(0)
        return
      }
      frame.current = requestAnimationFrame(loop)
    }
    frame.current = requestAnimationFrame(loop)
  }

  return (
    <IconButton
      label="Extinguish"
      className="cover"
      style={{ '--p': progress } as CSSProperties}
      onPointerDown={down}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <ExtinguishIcon />
    </IconButton>
  )
}

function MotionButton({ onGranted }: { onGranted: () => void }) {
  return (
    <button
      type="button"
      className="motion"
      aria-label="Let the planet follow the phone"
      onClick={() => {
        void enableMotion().then((ok) => {
          if (ok) onGranted()
        })
      }}
    >
      <MotionIcon />
    </button>
  )
}

function IconButton({
  label,
  className,
  style,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  children,
}: {
  label: string
  className?: string
  style?: CSSProperties
  onClick?: () => void
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={label}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {children}
    </button>
  )
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.1 1.4c.5 2.8-.4 4.4-1.5 5.7-.8.9-1.6 1.8-1.5 3.1.1.6.3 1.1.6 1.5-.9-.7-1.5-2.2-1.4-3.4-2.1 1.7-3.4 3.8-3.4 6.4 0 4.1 3.1 7.3 7.1 7.3 4.3 0 7.5-3.2 7.5-7.4 0-3.7-2.3-6.3-4.6-8.6-.3 1.7-1.2 2.8-1.2 2.8.1-2.4-.4-4.6-1.6-7.4z"
      />
    </svg>
  )
}

function LogIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.8 10.2c2.4-.9 14.2-.8 16.6.3 1 .4.9 2-.2 2.3-2.6.8-14 .7-16.4-.3-.9-.4-.9-1.9 0-2.3zM4.6 14c2.5-.6 12.6-.5 15.2.3 1 .3.8 1.7-.2 1.9-2.7.6-12.4.5-15-.2-.9-.2-.9-1.6 0-2z"
      />
    </svg>
  )
}

function SitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 16.2c2.1-4.6 12.9-4.6 15 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8.6" r="1.55" fill="currentColor" />
    </svg>
  )
}

function PlanetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function ExtinguishIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
      <path
        fill="currentColor"
        d="M12 6.2c.3 1.6-.2 2.5-.8 3.3-.4.5-.8 1-.7 1.7.2 1.4 1.3 2.3 2.6 2.3 1.5 0 2.6-1.1 2.6-2.6 0-1.3-.8-2.2-1.6-3-.1.6-.5 1.1-.5 1.1.1-.9-.2-1.8-.6-2.8z"
      />
    </svg>
  )
}

function MotionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="9"
        y="3.5"
        width="6"
        height="13"
        rx="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6.2 8.2c-1.3 1.3-1.3 5 0 6.3M17.8 8.2c1.3 1.3 1.3 5 0 6.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
