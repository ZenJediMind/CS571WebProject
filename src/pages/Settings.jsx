import { useState } from 'react'
import Card from 'react-bootstrap/Card'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import PageHeader from '../components/PageHeader'
import { GHOST_MODES, getSettings, saveSettings } from '../services/settingsService'

const GHOST_OPTIONS = [
  { value: GHOST_MODES.BOTH, label: 'Rivals + my best lap', help: 'Race everyone at once.' },
  { value: GHOST_MODES.RIVALS, label: 'Rivals only', help: 'Chase the leaderboard drivers on track.' },
  { value: GHOST_MODES.BEST, label: 'My best lap only', help: 'Classic time-trial ghost of your own record.' },
  { value: GHOST_MODES.OFF, label: 'No ghosts', help: 'Just you and the clock.' },
]

export default function Settings() {
  const [settings, setSettings] = useState(() => getSettings())
  const update = (partial) => setSettings(saveSettings(partial))

  return (
    <Container className="py-4">
      <PageHeader title="Settings" />
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
    </Container>
  )
}
