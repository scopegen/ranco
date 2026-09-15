import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from './Button'

/** A minimal draw-with-mouse/finger signature pad — no external library.
 * Filled white first (so ink is visible while drawing) rather than left
 * transparent; the backend strips that white background to transparent on
 * upload anyway (see app/signature.py), so a drawn signature ends up
 * exactly as transparent as an uploaded photo of one. */
export function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    fillWhite()
  }, [])

  function fillWhite() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  function getPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    // The canvas's own pixel size (width/height attrs) can differ from its
    // rendered CSS size — scale pointer coordinates into pixel space so
    // strokes land under the actual pointer regardless of that ratio.
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    drawingRef.current = true
    lastPointRef.current = getPos(e)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const point = getPos(e)
    const last = lastPointRef.current
    if (last) {
      ctx.strokeStyle = '#101826'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
    lastPointRef.current = point
    if (!hasDrawn) setHasDrawn(true)
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
  }

  function handleClear() {
    fillWhite()
    setHasDrawn(false)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    onSave(canvas.toDataURL('image/png'))
  }

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        className="touch-none rounded-lg border border-rule bg-white"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleSave} disabled={!hasDrawn}>
          Use this signature
        </Button>
        <Button type="button" variant="ghost" onClick={handleClear}>
          Clear
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
