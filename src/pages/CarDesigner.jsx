import { useEffect, useReducer, useRef, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { useNavigate } from 'react-router-dom'
import PaintCanvas from '../components/PaintCanvas'
import { PAINT_TOOLS } from '../components/paintTools'
import { CAR_CANVAS_SIZE, CAR_TEMPLATES, renderCarTemplateToDataUrl } from '../game/templates'
import { loadPlayerCar, savePlayerCar } from '../services/carService'

const TOOLBOX = [
  { tool: PAINT_TOOLS.PENCIL, icon: '✏️', label: 'Pencil' },
  { tool: PAINT_TOOLS.BRUSH, icon: '🖌️', label: 'Brush' },
  { tool: PAINT_TOOLS.ERASER, icon: '🧽', label: 'Eraser' },
  { tool: PAINT_TOOLS.FILL, icon: '🪣', label: 'Fill' },
  { tool: PAINT_TOOLS.LINE, icon: '📏', label: 'Line' },
  { tool: PAINT_TOOLS.RECT, icon: '▭', label: 'Rectangle' },
  { tool: PAINT_TOOLS.ELLIPSE, icon: '⬭', label: 'Ellipse' },
  { tool: PAINT_TOOLS.EYEDROPPER, icon: '💧', label: 'Pick Color' },
]

const BRUSH_SIZES = [
  { label: 'Small', size: 6 },
  { label: 'Medium', size: 14 },
  { label: 'Large', size: 26 },
]

const PALETTE = [
  { hex: '#000000', name: 'Black' }, { hex: '#555555', name: 'Dark gray' },
  { hex: '#aaaaaa', name: 'Light gray' }, { hex: '#ffffff', name: 'White' },
  { hex: '#c5050c', name: 'Badger red' }, { hex: '#e74c3c', name: 'Bright red' },
  { hex: '#e67e22', name: 'Orange' }, { hex: '#f7a600', name: 'Cheddar' },
  { hex: '#f4d03f', name: 'Yellow' }, { hex: '#1e8449', name: 'Green' },
  { hex: '#2ecc71', name: 'Bright green' }, { hex: '#17a2b8', name: 'Teal' },
  { hex: '#85c1e9', name: 'Sky blue' }, { hex: '#2471a3', name: 'Blue' },
  { hex: '#1a5276', name: 'Navy' }, { hex: '#7d3c98', name: 'Purple' },
  { hex: '#d63384', name: 'Magenta' }, { hex: '#f5b7b1', name: 'Pink' },
  { hex: '#6e2c00', name: 'Brown' }, { hex: '#d2b48c', name: 'Tan' },
]

const HISTORY_LIMIT = 20

function paintReducer(state, action) {
  switch (action.type) {
    case 'change':
    case 'replace':
      return {
        current: action.dataUrl,
        history: [...state.history.slice(-(HISTORY_LIMIT - 1)), state.current],
      }
    case 'undo': {
      if (state.history.length === 0) return state
      return { current: state.history.at(-1), history: state.history.slice(0, -1) }
    }
    default:
      return state
  }
}

/** Mini rasterized preview of a vector car template. */
function CarTemplatePreview({ template, size = 64 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, size, size)
    template.draw?.(ctx, size)
  }, [template, size])
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      role="img"
      aria-label={`${template.name} template preview`}
      className="bg-white border rounded"
    />
  )
}

export default function CarDesigner() {
  const navigate = useNavigate()
  const [paint, dispatch] = useReducer(paintReducer, null, () => ({
    current: loadPlayerCar().imageDataUrl,
    history: [],
  }))
  const [tool, setTool] = useState(PAINT_TOOLS.BRUSH)
  const [color, setColor] = useState('#c5050c')
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const dirty = paint.history.length > 0 && !saved

  const handleSave = () => {
    if (!savePlayerCar(paint.current)) {
      setSaveError(true)
      return
    }
    setSaveError(false)
    setSaved(true)
    navigate('/')
  }

  const handleBack = () => {
    if (!dirty || window.confirm('Leave without saving? Your car changes will be lost.')) {
      navigate('/')
    }
  }

  const handleUseTemplate = (template) => {
    if (window.confirm(`Replace your current drawing with the ${template.name} template?`)) {
      dispatch({ type: 'replace', dataUrl: renderCarTemplateToDataUrl(template.id) })
      setSaved(false)
    }
  }

  return (
    <Container fluid="xl" className="py-3">
      <Row className="align-items-center g-2 mb-2">
        <Col xs="auto">
          <Button variant="outline-secondary" size="sm" onClick={handleBack}>← Back</Button>
        </Col>
        <Col>
          <h1 className="h2 mb-0">Car Designer</h1>
        </Col>
        <Col xs="auto" className="d-flex align-items-center gap-2">
          <img
            src={paint.current}
            width={40}
            height={40}
            alt="Your car at race size"
            className="border rounded bg-white"
          />
          <Button variant="primary" onClick={handleSave}>Save Car</Button>
        </Col>
      </Row>
      <div className="wr-checker mb-2" aria-hidden="true" />

      {saveError && (
        <Alert variant="danger" dismissible onClose={() => setSaveError(false)}>
          Couldn't save — browser storage is full or blocked. Your drawing is still here;
          free up space (or leave private browsing) and try again.
        </Alert>
      )}

      <Row className="g-3">
        <Col md={3} lg={2}>
          <Card className="mb-2">
            <Card.Header className="py-1 text-uppercase small fw-bold">Tools</Card.Header>
            <Card.Body className="p-2">
              <div className="d-grid gap-1" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {TOOLBOX.map((item) => (
                  <Button
                    key={item.tool}
                    variant={tool === item.tool ? 'warning' : 'light'}
                    aria-pressed={tool === item.tool}
                    title={item.label}
                    onClick={() => setTool(item.tool)}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    <span className="visually-hidden">{item.label}</span>
                  </Button>
                ))}
              </div>
            </Card.Body>
          </Card>
          <Form.Group className="mb-2">
            <Form.Label htmlFor="brush-size" className="small fw-bold text-uppercase">
              Brush size
            </Form.Label>
            <Form.Select
              id="brush-size"
              size="sm"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            >
              {BRUSH_SIZES.map((option) => (
                <option key={option.size} value={option.size}>{option.label}</option>
              ))}
            </Form.Select>
          </Form.Group>
          <Button
            variant="outline-secondary"
            size="sm"
            className="w-100"
            onClick={() => dispatch({ type: 'undo' })}
            disabled={paint.history.length === 0}
          >
            ↩ Undo
          </Button>
        </Col>

        <Col md={6} lg={7} className="text-center">
          <PaintCanvas
            width={CAR_CANVAS_SIZE}
            height={CAR_CANVAS_SIZE}
            tool={tool}
            color={color}
            brushSize={brushSize}
            imageDataUrl={paint.current}
            onChange={(dataUrl) => { dispatch({ type: 'change', dataUrl }); setSaved(false) }}
            onPickColor={setColor}
          />
          <div
            className="d-flex flex-wrap justify-content-center align-items-center gap-1 mt-2"
            role="group"
            aria-label="Color palette"
          >
            <span
              className="wr-swatch me-2"
              style={{ background: color, display: 'inline-block' }}
              title="Current color"
              aria-label={`Current color ${color}`}
            />
            {PALETTE.map((swatch) => (
              <Button
                key={swatch.hex}
                className="wr-swatch"
                style={{ background: swatch.hex }}
                aria-label={swatch.name}
                aria-pressed={color === swatch.hex}
                onClick={() => setColor(swatch.hex)}
              />
            ))}
          </div>
        </Col>

        <Col md={3}>
          <Card>
            <Card.Header className="py-1 text-uppercase small fw-bold">
              Start from a template
            </Card.Header>
            <Card.Body className="p-2 d-grid gap-2">
              {CAR_TEMPLATES.map((template) => (
                <div key={template.id} className="d-flex align-items-center gap-2">
                  <CarTemplatePreview template={template} />
                  <div className="flex-grow-1 small">{template.name}</div>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => handleUseTemplate(template)}
                  >
                    Use →
                  </Button>
                </div>
              ))}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}
