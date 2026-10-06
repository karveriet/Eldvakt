import * as THREE from 'three'
import { landGeometries } from '../geo/land.ts'
import type { Geometry, Position } from 'geojson'

/** Equirectangular mask: white land, black water. No borders, names, or roads. */
export function createLandTexture(): THREE.CanvasTexture {
  const width = 2048
  const height = 1024
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the earth')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#ffffff'
  for (const geometry of landGeometries()) drawGeometry(ctx, geometry, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

function drawGeometry(ctx: CanvasRenderingContext2D, geometry: Geometry, width: number, height: number) {
  if (geometry.type === 'Polygon') {
    fillPolygon(ctx, geometry.coordinates, width, height)
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) fillPolygon(ctx, polygon, width, height)
  }
}

function fillPolygon(
  ctx: CanvasRenderingContext2D,
  rings: readonly Position[][],
  width: number,
  height: number,
) {
  ctx.beginPath()
  for (const ring of rings) {
    ring.forEach(([lon, lat], index) => {
      const x = ((lon + 180) / 360) * width
      const y = ((90 - lat) / 180) * height
      if (index === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
  ctx.fill('evenodd')
}
