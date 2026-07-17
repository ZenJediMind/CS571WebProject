// Player car persistence — the car is a PNG bitmap saved as a data URL.
import { readObject, writeKey } from './storage'
import { renderCarTemplateToDataUrl } from '../game/templates'

const CAR_KEY = 'playerCar'

export function defaultCarDataUrl() {
  return renderCarTemplateToDataUrl('car-classic')
}

/** Lazily falls back to the default template so a fresh browser still has a car. */
export function loadPlayerCar() {
  const saved = readObject(CAR_KEY, null)
  return saved?.imageDataUrl && typeof saved.imageDataUrl === 'string'
    ? { imageDataUrl: saved.imageDataUrl }
    : { imageDataUrl: defaultCarDataUrl() }
}

export function savePlayerCar(imageDataUrl) {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) return false
  return writeKey(CAR_KEY, { imageDataUrl })
}
