// Player car persistence — the car is a PNG bitmap saved as a data URL.
import { readObject, writeKey } from './storage.js'
import { renderCarTemplateToDataUrl } from '../game/templates.js'

const CAR_KEY = 'playerCar'

export function defaultCarDataUrl() {
  return renderCarTemplateToDataUrl('car-classic')
}

/** Lazily falls back to the default template so a fresh browser still has a car. */
export function loadPlayerCar() {
  const saved = readObject(CAR_KEY, null)
  const url = saved?.imageDataUrl
  return typeof url === 'string' && url.startsWith('data:image/')
    ? { imageDataUrl: url }
    : { imageDataUrl: defaultCarDataUrl() }
}

export function savePlayerCar(imageDataUrl) {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) return false
  return writeKey(CAR_KEY, { imageDataUrl })
}
