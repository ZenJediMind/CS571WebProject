import { useEffect, useReducer, useRef, useState } from 'react'
import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import PaintCanvas from '../components/PaintCanvas'
import StorageFullAlert from '../components/StorageFullAlert'
import { PAINT_TOOLS } from '../components/paintTools'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'
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

const BRUSH_SIZE = { min: 2, max: 40, step: 2, initial: 14 }

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
const TEMPLATE_THUMB_SIZE = 96

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
function CarTemplatePreview({ template, size = TEMPLATE_THUMB_SIZE }) {
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
      className="wr-car-template-thumb"
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
  const [brushSize, setBrushSize] = useState(BRUSH_SIZE.initial)
  const [persistedUrl, setPersistedUrl] = useState(() => loadPlayerCar().imageDataUrl)
  const [saveError, setSaveError] = useState(false)

  // Dirty when the canvas differs from what is actually in storage (undo-safe).
  const dirty = paint.current !== persistedUrl
  const allowNextNavigation = useUnsavedChangesGuard(
    dirty,
    'Leave without saving? Your car changes will be lost.',
  )

  const handleSave = () => {
    if (!savePlayerCar(paint.current)) {
      setSaveError(true)
      return
    }
    setSaveError(false)
    setPersistedUrl(paint.current)
    allowNextNavigation()
    navigate('/')
  }

  const handleUseTemplate = (template) => {
    if (window.confirm(`Replace your current drawing with the ${template.name} template?`)) {
      dispatch({ type: 'replace', dataUrl: renderCarTemplateToDataUrl(template.id) })
    }
  }

  return (
    <Container fluid="xl" className="py-3 wr-car-studio">
      <PageHeader title="Car Designer">
        <div className="d-flex align-items-center gap-2">
          <img
            src={paint.current}
            width={56}
            height={56}
            alt="Your car at race size"
            className="wr-car-race-preview"
          />
          <Button variant="primary" onClick={handleSave}>Save Car</Button>
        </div>
      </PageHeader>

      {saveError && (
        <StorageFullAlert itemLabel="drawing" onClose={() => setSaveError(false)} />
      )}

      <Row className="g-3 align-items-start">
        <Col xs={12} md={4} lg={3} xl={2}>
          <div className="wr-car-tool-panel mb-2">
            <div className="wr-panel-label">Tools</div>
            <div className="wr-car-tools" role="toolbar" aria-label="Paint tools">
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
            <Form.Group className="mt-2 mb-2">
              <Form.Label htmlFor="brush-size" className="wr-panel-label mb-1">
                Brush size: {brushSize}px
              </Form.Label>
              <div className="d-flex align-items-center gap-2">
                <Form.Range
                  id="brush-size"
                  min={BRUSH_SIZE.min}
                  max={BRUSH_SIZE.max}
                  step={BRUSH_SIZE.step}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                />
                <span className="wr-brush-dot-box" aria-hidden="true">
                  <span className="wr-brush-dot" style={{ width: brushSize, height: brushSize }} />
                </span>
              </div>
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
          </div>
        </Col>

        <Col xs={12} md={8} lg={6} xl={7} className="text-center">
          <PaintCanvas
            width={CAR_CANVAS_SIZE}
            height={CAR_CANVAS_SIZE}
            tool={tool}
            color={color}
            brushSize={brushSize}
            imageDataUrl={paint.current}
            onChange={(dataUrl) => dispatch({ type: 'change', dataUrl })}
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

        <Col xs={12} lg={3}>
          <div className="wr-car-tool-panel">
            <div className="wr-panel-label">Start from a template</div>
            {CAR_TEMPLATES.map((template) => (
              <div key={template.id} className="wr-car-template-row">
                <CarTemplatePreview template={template} />
                <div className="flex-grow-1 small fw-semibold">{template.name}</div>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => handleUseTemplate(template)}
                >
                  Use
                </Button>
              </div>
            ))}
          </div>
        </Col>
      </Row>
    </Container>
  )
}
