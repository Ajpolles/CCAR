import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import './SearchFilteringAppoinment.css'

const SAMPLE_APPOINTMENTS = [
  { id: 1, patientName: 'Jessa Alvarez', patientId: '2023-00123', reason: 'General Consultation', date: '2026-10-26', time: '09:00', status: 'Scheduled', staff: 'Dr. Reyes' },
  { id: 2, patientName: 'Danica Custodio', patientId: '2022-00456', reason: 'Dental Check-up', date: '2026-10-26', time: '10:30', status: 'Completed', staff: 'Dr. Lim' },
  { id: 3, patientName: 'Aj Polles', patientId: '2024-00789', reason: 'Medical Certificate', date: '2026-10-27', time: '13:00', status: 'Pending', staff: 'Nurse Cruz' },
  { id: 4, patientName: 'Kassandra Ortega', patientId: '2021-00321', reason: 'General Consultation', date: '2026-10-28', time: '08:30', status: 'Cancelled', staff: 'Dr. Reyes' },
  { id: 5, patientName: 'Kevin Villaruz', patientId: '2023-00654', reason: 'Vaccination', date: '2026-10-29', time: '14:15', status: 'Scheduled', staff: 'Nurse Cruz' },
]

const STATUS = ['Pending', 'Scheduled', 'Completed', 'Cancelled']

const EMPTY_FILTERS = { query: '', status: 'All', reason: 'All', from: '', to: '' }

export default function AppointmentSearchFilter({ appointments = SAMPLE_APPOINTMENTS }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const reasons = useMemo(
    () => [...new Set(appointments.map((a) => a.reason))].sort(),
    [appointments],
  )

  const results = useMemo(() => {
    const q = filters.query.trim().toLowerCase()
    return appointments
      .filter((a) => {
        if (q) {
          const haystack = [a.patientName, a.patientId, a.reason, a.staff]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(q)) return false
        }
        if (filters.status !== 'All' && a.status !== filters.status) return false
        if (filters.reason !== 'All' && a.reason !== filters.reason) return false
        if (filters.from && a.date < filters.from) return false
        if (filters.to && a.date > filters.to) return false
        return true
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  }, [appointments, filters])

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)

  const update = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  return (
    <section className="appointment-filter">
      <div className="search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={filters.query}
          onChange={update('query')}
          placeholder="Search by patient name, ID, reason or staff"
          aria-label="Search appointments"
        />
      </div>

      <div className="filters">
        <label>
          Status
          <select value={filters.status} onChange={update('status')}>
            <option>All</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <label>
          Reason for visit
          <select value={filters.reason} onChange={update('reason')}>
            <option>All</option>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>

        <label>
          From
          <input type="date" value={filters.from} onChange={update('from')} />
        </label>

        <label>
          To
          <input type="date" value={filters.to} onChange={update('to')} />
        </label>

        <button
          type="button"
          className="clear-btn"
          onClick={() => setFilters(EMPTY_FILTERS)}
          disabled={!isFiltered}
        >
          <X size={15} aria-hidden="true" /> Clear filters
        </button>
      </div>

      <p className="count" aria-live="polite">
        Showing {results.length} of {appointments.length} appointments
      </p>

      {results.length === 0 ? (
        <div className="empty">
          <strong>No appointments match your search.</strong>
          <span>Try a different name or clear the filters.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Patient</th>
                <th>Reason</th>
                <th>Staff</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((a) => (
                <tr key={a.id}>
                  <td>{a.date}</td>
                  <td>{a.time}</td>
                  <td>
                    {a.patientName}
                    <small>{a.patientId}</small>
                  </td>
                  <td>{a.reason}</td>
                  <td>{a.staff}</td>
                  <td>
                    <span className={`status ${a.status.toLowerCase()}`}>{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}