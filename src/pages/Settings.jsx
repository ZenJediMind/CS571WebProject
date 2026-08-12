import { useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Card from 'react-bootstrap/Card'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import { Link } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { GHOST_MODES, getSettings, saveSettings } from '../services/settingsService'

const GHOST_OPTIONS = [
  { value: GHOST_MODES.BOTH, label: 'Opponents + my best lap', help: 'Race saved Race Night player ghosts, simulated rivals, and your recording.' },
  { value: GHOST_MODES.RIVALS, label: 'Opponents only', help: 'Race every saved Race Night player ghost alongside simulated rivals.' },
  { value: GHOST_MODES.BEST, label: 'My best lap only', help: 'Classic time-trial ghost of your own record.' },
  { value: GHOST_MODES.OFF, label: 'No ghosts', help: 'Just you and the clock.' },
]

export default function Settings() {
  const [settings, setSettings] = useState(() => getSettings())
  const [saveError, setSaveError] = useState(false)
  const update = (partial) => {
    const saved = saveSettings(partial)
    setSaveError(!saved)
    if (saved) setSettings(saved)
  }

  return (
    <Container className="py-4">
      <PageHeader title="Settings" />
      {saveError && (
        <Alert variant="danger">Couldn't save because browser storage is full or blocked.</Alert>
      )}
      <Card className="mb-3" style={{ maxWidth: '32rem' }}>
        <Card.Header className="text-uppercase small fw-bold">Ghost cars on track</Card.Header>
        <Card.Body>
          {GHOST_OPTIONS.map((option) => (
            <Form.Check
              key={option.value}
              type="radio"
              name="ghost-mode"
              id={`ghosts-${option.value}`}
              label={<>{option.label} <span className="text-secondary small">— {option.help}</span></>}
              checked={settings.ghosts === option.value}
              onChange={() => update({ ghosts: option.value })}
              className="mb-2"
            />
          ))}
        </Card.Body>
      </Card>
      <Card style={{ maxWidth: '32rem' }}>
        <Card.Header className="text-uppercase small fw-bold">Sound</Card.Header>
        <Card.Body>
          <Form.Check
            type="switch"
            id="sound-toggle"
            label="Engine, skid, and countdown sounds"
            checked={settings.sound}
            onChange={(event) => update({ sound: event.target.checked })}
          />
        </Card.Body>
      </Card>
      <p className="mt-4 mb-0">
        <Link to="/performance">View live performance statistics</Link>
      </p>
    </Container>
  )
}
