// Player car persistence — the car is a PNG bitmap saved as a data URL.
import { readKey, writeKey } from './storage'
import { renderCarTemplateToDataUrl } from '../game/templates'

const CAR_KEY = 'playerCar'

export function defaultCarDataUrl() {
  return renderCarTemplateToDataUrl('car-classic')
}

/** Lazily falls back to the default template so a fresh browser still has a car. */
export function loadPlayerCar() {
  const saved = readKey(CAR_KEY, null)
  return saved?.imageDataUrl ? saved : { imageDataUrl: defaultCarDataUrl() }
}

export function savePlayerCar(imageDataUrl) {
  return writeKey(CAR_KEY, { imageDataUrl })
}
