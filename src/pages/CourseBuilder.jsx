import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import ButtonGroup from 'react-bootstrap/ButtonGroup'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import PiecePreview from '../components/PiecePreview'
import { createEmptyGrid, GRID_COLS, GRID_ROWS, PIECES, validateCourse } from '../game/courseModel'
import { drawCourseInto, drawTrackPiece } from '../game/render'
import { THEMES, getTheme, DEFAULT_THEME_ID } from '../game/themes'
import { copyCourse, createDraftCourse, getCourse, saveCourse } from '../services/courseService'

const BUILDER_CELL = 64
const CANVAS_WIDTH = GRID_COLS * BUILDER_CELL
const CANVAS_HEIGHT = GRID_ROWS * BUILDER_CELL
const HISTORY_LIMIT = 50
const ERASER = 'eraser'
const sameCell = (a, b) => a?.row === b?.row && a?.col === b?.col

const PALETTE_SECTIONS = [
  {
    title: 'Straights',
    items: [{ label: 'Straight', piece: PIECES.STRAIGHT }],
  },
  {
    title: 'Curves',
    items: [
      { label: 'Curve ↰', piece: PIECES.CURVE, rotation: 0 },
      { label: 'Curve ↱', piece: PIECES.CURVE, rotation: 90 },
      { label: 'S-Bend', piece: PIECES.S_BEND },
    ],
  },
  {
    title: 'Specials',
    items: [
      { label: 'Start / Finish', piece: PIECES.START },
      { label: 'Boost Pad', piece: PIECES.BOOST },
      { label: 'Obstacle', piece: PIECES.OBSTACLE },
      { label: 'Pit Stop', piece: PIECES.PIT },
      { label: 'Oil Slick', piece: PIECES.OIL },
      { label: 'Ramp', piece: PIECES.RAMP },
    ],
  },
]

/* ---------- pure grid transforms (copy outer array + changed rows) ---------- */

function withCell(grid, row, col, cell) {
  const nextRow = [...grid[row]]
  nextRow[col] = cell
  const next = [...grid]
  next[row] = nextRow
  return next
}

/** Place a stamp; a second START anywhere becomes a STRAIGHT automatically. */
function placeStamp(grid, row, col, stamp) {
  const existing = grid[row][col]
  if (existing?.piece === stamp.piece && existing.rotation === stamp.rotation) return grid

  let next = grid
  if (stamp.piece === PIECES.START) {
    next = next.map((cells) =>
      cells.some((cell) => cell?.piece === PIECES.START)
        ? cells.map((cell) =>
            cell?.piece === PIECES.START
              ? { piece: PIECES.STRAIGHT, rotation: cell.rotation }
              : cell,
          )
        : cells,
    )
  }
  return withCell(next, row, col, { piece: stamp.piece, rotation: stamp.rotation })
}

function rotateCell(grid, row, col) {
  const cell = grid[row][col]
  if (!cell) return grid
  return withCell(grid, row, col, { ...cell, rotation: (cell.rotation + 90) % 360 })
}

/* ---------- editor state: one reducer holds grid + history + dirty ---------- */

function editorReducer(state, action) {
  switch (action.type) {
    case 'edit': {
      const grid = action.transform(state.grid)
      if (grid === state.grid) return state
      return {
        grid,
        undo: [...state.undo.slice(-(HISTORY_LIMIT - 1)), state.grid],
        redo: [],
        dirty: true,
      }
    }
    case 'undo': {
      if (state.undo.length === 0) return state
      return {
        grid: state.undo.at(-1),
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, state.grid],
        dirty: true,
      }
    }
    case 'redo': {
      if (state.redo.length === 0) return state
      return {
        grid: state.redo.at(-1),
        redo: state.redo.slice(0, -1),
        undo: [...state.undo, state.grid],
        dirty: true,
      }
    }
    case 'saved':
      return { ...state, dirty: false }
    default:
      return state
  }
}

/**
 * Remount the editor per navigation so "Build" always hands out a fresh
 * draft and switching courses fully resets name/history state.
 */
export default function CourseBuilder() {
  const { courseId } = useParams()
  const location = useLocation()
  return <CourseBuilderEditor key={courseId === 'new' ? location.key : courseId} />
}

function CourseBuilderEditor() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const canvasRef = useRef(null)

  // '/build/new' edits a fresh in-memory draft; it only persists on Save/Test
  const course = useMemo(
    () => (courseId === 'new' ? createDraftCourse() : getCourse(courseId)),
    [courseId],
  )
  const [name, setName] = useState(course?.name ?? '')
  const [editor, dispatch] = useReducer(editorReducer, null, () => ({
    grid: course?.grid ?? null,
    undo: [],
    redo: [],
    dirty: false,
  }))
  const [stamp, setStamp] = useState({ piece: PIECES.STRAIGHT, rotation: 0 })
  const [themeId, setThemeId] = useState(course?.theme ?? DEFAULT_THEME_ID)
  const [showGridLines, setShowGridLines] = useState(true)
  const [hoverCell, setHoverCell] = useState(null)
  const [cursorCell, setCursorCell] = useState(null)
  const [saveError, setSaveError] = useState(false)
  const paintedCellRef = useRef(null) // last cell touched during a drag

  const validation = useMemo(
    () => (editor.grid ? validateCourse(editor.grid) : null),
    [editor.grid],
  )
  const hasUnsavedChanges = editor.dirty || name !== course?.name || themeId !== (course?.theme ?? DEFAULT_THEME_ID)

  /* ---------- canvas drawing ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !editor.grid) return
    const ctx = canvas.getContext('2d')
    const theme = getTheme(themeId)
    drawCourseInto(ctx, editor.grid, BUILDER_CELL, theme)

    if (showGridLines) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.lineWidth = 1
      for (let col = 1; col < GRID_COLS; col++) {
        ctx.beginPath()
        ctx.moveTo(col * BUILDER_CELL, 0)
        ctx.lineTo(col * BUILDER_CELL, CANVAS_HEIGHT)
        ctx.stroke()
      }
      for (let row = 1; row < GRID_ROWS; row++) {
        ctx.beginPath()
        ctx.moveTo(0, row * BUILDER_CELL)
        ctx.lineTo(CANVAS_WIDTH, row * BUILDER_CELL)
        ctx.stroke()
      }
    }

    // Ghost preview of the pending stamp under the pointer
    if (hoverCell && stamp !== ERASER) {
      ctx.save()
      ctx.globalAlpha = 0.55
      drawTrackPiece(
        ctx, stamp.piece, stamp.rotation,
        hoverCell.col * BUILDER_CELL, hoverCell.row * BUILDER_CELL, BUILDER_CELL, theme,
      )
      ctx.restore()
    }
    if (hoverCell && stamp === ERASER) {
      ctx.strokeStyle = '#c5050c'
      ctx.lineWidth = 3
      ctx.strokeRect(
        hoverCell.col * BUILDER_CELL + 2, hoverCell.row * BUILDER_CELL + 2,
        BUILDER_CELL - 4, BUILDER_CELL - 4,
      )
    }

    // Keyboard cursor
    if (cursorCell) {
      ctx.strokeStyle = '#f7a600'
      ctx.lineWidth = 4
      ctx.strokeRect(
        cursorCell.col * BUILDER_CELL + 2, cursorCell.row * BUILDER_CELL + 2,
        BUILDER_CELL - 4, BUILDER_CELL - 4,
      )
    }
  }, [editor.grid, stamp, hoverCell, cursorCell, showGridLines, themeId])

  /* ---------- edits ---------- */
  const applyAt = useCallback((row, col, { allowRotate }) => {
    if (stamp === ERASER) {
      dispatch({ type: 'edit', transform: (grid) => withCell(grid, row, col, null) })
      return
    }
    dispatch({
      type: 'edit',
      transform: (grid) => {
        const existing = grid[row][col]
        // Clicking a cell that already holds this exact stamp spins it 90°
        if (allowRotate && existing?.piece === stamp.piece && existing.rotation === stamp.rotation) {
          return rotateCell(grid, row, col)
        }
        return placeStamp(grid, row, col, stamp)
      },
    })
  }, [stamp])

  const rotateStamp = useCallback((degrees) => {
    setStamp((prev) =>
      prev === ERASER ? prev : { ...prev, rotation: (prev.rotation + degrees + 360) % 360 },
    )
  }, [])

  /* ---------- pointer handling ---------- */
  const cellFromPointer = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * GRID_COLS)
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * GRID_ROWS)
    if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null
    return { row, col }
  }

  const handlePointerDown = (event) => {
    const cell = cellFromPointer(event)
    if (!cell) return
    event.currentTarget.setPointerCapture(event.pointerId)
    paintedCellRef.current = cell
    applyAt(cell.row, cell.col, { allowRotate: true })
  }

  const handlePointerMove = (event) => {
    const cell = cellFromPointer(event)
    setHoverCell((current) => sameCell(current, cell) ? current : cell)
    const painted = paintedCellRef.current
    if (!painted || !cell) return
    if (event.buttons === 0) {
      paintedCellRef.current = null
      return
    }
    if (!sameCell(cell, painted)) {
      paintedCellRef.current = cell
      applyAt(cell.row, cell.col, { allowRotate: false })
    }
  }

  const handlePointerUp = () => { paintedCellRef.current = null }

  /* ---------- keyboard editing on the grid ---------- */
  const handleCanvasKeyDown = (event) => {
    const cursor = cursorCell ?? { row: 0, col: 0 }
    const moves = {
      ArrowUp: { row: -1, col: 0 }, ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 }, ArrowRight: { row: 0, col: 1 },
    }
    if (moves[event.key]) {
      event.preventDefault()
      setCursorCell({
        row: Math.min(GRID_ROWS - 1, Math.max(0, cursor.row + moves[event.key].row)),
        col: Math.min(GRID_COLS - 1, Math.max(0, cursor.col + moves[event.key].col)),
      })
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      applyAt(cursor.row, cursor.col, { allowRotate: true })
      setCursorCell(cursor)
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      dispatch({ type: 'edit', transform: (grid) => withCell(grid, cursor.row, cursor.col, null) })
      setCursorCell(cursor)
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault()
      rotateStamp(90)
    }
  }

  /* ---------- top actions ---------- */
  const persistCourse = () => {
    const saved = saveCourse({ ...course, name: name.trim() || 'Untitled Course', grid: editor.grid, theme: themeId })
    if (!saved) {
      setSaveError(true)
      return null
    }
    setSaveError(false)
    dispatch({ type: 'saved' })
    return saved
  }

  const handleSave = () => {
    if (persistCourse()) navigate('/')
  }

  const handleTestDrive = () => {
    const saved = persistCourse()
    if (!saved) return
    // Swap the /build/new history entry for the saved id so Back returns here
    if (courseId === 'new') navigate(`/build/${saved.id}`, { replace: true })
    navigate(`/race/${saved.id}`)
  }

  const handleBack = () => {
    if (!hasUnsavedChanges || window.confirm('Leave without saving? Unsaved track changes will be lost.')) {
      navigate('/')
    }
  }

  /* ---------- guards ---------- */
  if (!course) {
    return (
      <Container className="py-4">
        <Alert variant="warning">
          Course not found. <Alert.Link as={Link} to="/browse">Back to Browse</Alert.Link>
        </Alert>
      </Container>
    )
  }

  if (course.isTemplate) {
    return (
      <Container className="py-4">
        <Alert variant="info" className="d-flex align-items-center gap-3">
          <span>
            <strong>{course.name}</strong> is a built-in template and can't be edited directly.
          </span>
          <Button
            variant="primary"
            onClick={() => {
              const copy = copyCourse(course.id)
              if (copy) navigate(`/build/${copy.id}`)
              else setSaveError(true)
            }}
          >
            Copy &amp; Edit
          </Button>
        </Alert>
        {saveError && (
          <Alert variant="danger" dismissible onClose={() => setSaveError(false)} className="mt-3">
            Couldn't save — browser storage is full or blocked. Your track is still here;
            free up space (or leave private browsing) and try again.
          </Alert>
        )}
      </Container>
    )
  }

  const isEraser = stamp === ERASER

  return (
    <Container fluid="xl" className="py-3">
      <h1 className="visually-hidden">Course Builder</h1>
      <Row className="align-items-center g-2 mb-2">
        <Col xs="auto">
          <Button variant="outline-secondary" size="sm" onClick={handleBack}>← Back</Button>
        </Col>
        <Col xs={12} sm>
          <Form.Label htmlFor="course-name" visuallyHidden>Course name</Form.Label>
          <Form.Control
            id="course-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Course name"
            maxLength={40}
          />
        </Col>
        <Col xs={12} sm="auto">
          <Form.Label htmlFor="course-setting" visuallyHidden>Setting</Form.Label>
          <Form.Select
            id="course-setting"
            aria-label="Track setting"
            value={themeId}
            onChange={(event) => setThemeId(event.target.value)}
          >
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.emoji} {theme.name}
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col xs="auto">
          <Button variant="success" onClick={handleTestDrive} disabled={!validation?.ok}>
            Test Drive
          </Button>
        </Col>
        <Col xs="auto">
          <Button variant="primary" onClick={handleSave} disabled={!validation?.ok}>
            Save Course
          </Button>
        </Col>
      </Row>
      <div className="wr-checker mb-3" aria-hidden="true" />

      {saveError && (
        <Alert variant="danger" dismissible onClose={() => setSaveError(false)}>
          Couldn't save — browser storage is full or blocked. Your track is still here;
          free up space (or leave private browsing) and try again.
        </Alert>
      )}

      <Alert variant="light" className="py-2">
        Pick a piece, then click or drag on the grass to lay track. Click a placed piece
        again to rotate it. Build one closed loop with a Start/Finish, then Test Drive.
      </Alert>

      <Row className="g-3">
        <Col md={3} lg={2}>
          {PALETTE_SECTIONS.map((section) => (
            <Card key={section.title} className="mb-2">
              <Card.Header className="py-1 text-uppercase small fw-bold">
                {section.title}
              </Card.Header>
              <Card.Body className="p-2 d-grid gap-1">
                {section.items.map((item) => {
                  const active = !isEraser
                    && stamp.piece === item.piece
                    && (item.rotation === undefined || stamp.rotation === item.rotation)
                  return (
                    <Button
                      key={item.label}
                      variant={active ? 'warning' : 'light'}
                      className="d-flex align-items-center gap-2 text-start"
                      aria-pressed={active}
                      onClick={() => setStamp({ piece: item.piece, rotation: item.rotation ?? 0 })}
                    >
                      <PiecePreview piece={item.piece} rotation={item.rotation ?? 0} label="" />
                      <span className="small">{item.label}</span>
                    </Button>
                  )
                })}
              </Card.Body>
            </Card>
          ))}
          <Button
            variant={isEraser ? 'warning' : 'light'}
            className="w-100"
            aria-pressed={isEraser}
            onClick={() => setStamp(ERASER)}
          >
            🧽 Eraser
          </Button>
        </Col>

        <Col md={9} lg={10}>
          <div className="d-flex flex-wrap gap-2 mb-2">
            <ButtonGroup size="sm">
              <Button
                variant="outline-secondary"
                onClick={() => dispatch({ type: 'undo' })}
                disabled={editor.undo.length === 0}
              >
                ↩ Undo
              </Button>
              <Button
                variant="outline-secondary"
                onClick={() => dispatch({ type: 'redo' })}
                disabled={editor.redo.length === 0}
              >
                ↪ Redo
              </Button>
            </ButtonGroup>
            <ButtonGroup size="sm">
              <Button variant="outline-secondary" onClick={() => rotateStamp(-90)} disabled={isEraser}>
                ⟲ Rotate
              </Button>
              <Button variant="outline-secondary" onClick={() => rotateStamp(90)} disabled={isEraser}>
                ⟳ Rotate
              </Button>
            </ButtonGroup>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                if (window.confirm('Clear the whole track?')) {
                  dispatch({ type: 'edit', transform: createEmptyGrid })
                }
              }}
            >
              Clear
            </Button>
            <Form.Check
              type="switch"
              id="grid-toggle"
              label="Grid"
              className="ms-auto"
              checked={showGridLines}
              onChange={(event) => setShowGridLines(event.target.checked)}
            />
          </div>

          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="wr-builder-canvas"
            tabIndex={0}
            role="img"
            aria-label={`Course editing grid, ${GRID_COLS} by ${GRID_ROWS} cells. Use arrow keys to move, Enter to place, Delete to erase, R to rotate.`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => { setHoverCell(null); handlePointerUp() }}
            onKeyDown={handleCanvasKeyDown}
            onBlur={() => setCursorCell(null)}
          />

          <Alert
            variant={validation?.ok ? 'success' : 'warning'}
            className="py-2 mt-2 mb-0"
            aria-live="polite"
          >
            {validation?.ok
              ? 'Track is race-ready! Test Drive it or Save.'
              : validation?.error}
          </Alert>
        </Col>
      </Row>
    </Container>
  )
}
