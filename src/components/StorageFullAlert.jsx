import Alert from 'react-bootstrap/Alert'

/**
 * Shared dismissible alert for a failed localStorage write. `itemLabel`
 * names what the racer keeps on screen despite the failure (track, drawing).
 */
export default function StorageFullAlert({ itemLabel, onClose, className }) {
  return (
    <Alert variant="danger" dismissible onClose={onClose} className={className}>
      Couldn't save — browser storage is full or blocked. Your {itemLabel} is still here;
      free up space (or leave private browsing) and try again.
    </Alert>
  )
}
