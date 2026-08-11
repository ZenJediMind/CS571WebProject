import { useEffect, useState } from 'react'
import Button from 'react-bootstrap/Button'
import Container from 'react-bootstrap/Container'
import Table from 'react-bootstrap/Table'
import PageHeader from '../components/PageHeader'
import { getPerformanceStats, resetPerformanceStats } from '../services/performanceService'

function displayMs(value) {
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`
}

/** Live, bounded performance profile for backend requests and the race loop. */
export default function Performance() {
  const [stats, setStats] = useState(() => getPerformanceStats())

  useEffect(() => {
    const timer = setInterval(() => setStats(getPerformanceStats()), 1000)
    return () => clearInterval(timer)
  }, [])

  const reset = () => {
    resetPerformanceStats()
    setStats([])
  }

  return (
    <Container className="py-4">
      <PageHeader title="Performance" backTo="/settings">
        <Button variant="outline-secondary" size="sm" onClick={reset}>Reset samples</Button>
      </PageHeader>
      <p className="text-secondary">
        Rolling local measurements for Supabase requests and the race loop. Samples remain in this tab only.
      </p>
      {stats.length === 0 ? (
        <p className="text-secondary">No measurements yet. Browse courses or complete a race to collect samples.</p>
      ) : (
        <Table striped responsive className="wr-board-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Samples</th>
              <th scope="col">Average</th>
              <th scope="col">P95</th>
              <th scope="col">Min</th>
              <th scope="col">Max</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((metric) => (
              <tr key={metric.name}>
                <td><code>{metric.name}</code></td>
                <td>{metric.count}</td>
                <td>{displayMs(metric.averageMs)}</td>
                <td>{displayMs(metric.p95Ms)}</td>
                <td>{displayMs(metric.minMs)}</td>
                <td>{displayMs(metric.maxMs)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  )
}
