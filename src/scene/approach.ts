import { distanceForMerge } from '../fire/cluster.ts'
import { VIEW_ARRIVE } from '../fire/view-distance.ts'
import { getView, travelTo } from './view-store.ts'

export type ApproachMember = {
  id: string
  lat: number
  lon: number
  weight: number
}

/** Move toward a glow. A wide cluster stops where it can split; one fire is a hearth. */
export function approachCluster(
  lat: number,
  lon: number,
  radiusKm: number,
  members: ApproachMember[],
) {
  if (members.length <= 1) {
    const fire = members[0]
    if (!fire) return
    const view = getView()
    const alreadyThere =
      view.focusId === fire.id &&
      Math.abs(view.lat - fire.lat) < 0.05 &&
      Math.abs(view.distance - VIEW_ARRIVE) < 0.08
    if (!alreadyThere) travelTo(fire.lat, fire.lon, VIEW_ARRIVE, fire.id)
    return
  }
  const splitAt = distanceForMerge(Math.max(radiusKm * 0.75, 0.12))
  if (splitAt >= getView().distance - 0.04) {
    const best = [...members].sort((a, b) => b.weight - a.weight)[0]
    travelTo(best.lat, best.lon, VIEW_ARRIVE, best.id)
    return
  }
  travelTo(lat, lon, Math.max(splitAt, VIEW_ARRIVE), null)
}
