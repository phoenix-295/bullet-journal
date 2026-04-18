'use client'

import { useState, useRef, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addEntry, toggleEntry, deleteEntry } from './actions'

/* ─── Config ─────────────────────────────────────────────────── */

const BULLET_TYPES = {
  task:     { symbol: '•',  label: 'Task',     colorClass: 'type-task' },
  event:    { symbol: '◯',  label: 'Event',    colorClass: 'type-event' },
  note:     { symbol: '—',  label: 'Note',     colorClass: 'type-note' },
  priority: { symbol: '★',  label: 'Priority', colorClass: 'type-priority' },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// April 18 2026 = Thursday (index 4)
// Build 14 days ending today
const buildDates = () => {
  const dates = []
  const baseDay = 4 // Thursday
  for (let i = 0; i < 14; i++) {
    const day = 18 - i
    const weekdayIdx = ((baseDay - i) % 7 + 7) % 7
    dates.push({
      key: `Apr ${day}`,
      day,
      month: 'Apr',
      weekday: WEEKDAYS[weekdayIdx],
    })
  }
  return dates
}

const DATES = buildDates()
const TODAY = DATES[0].key

// April 2026: Apr 1 = Monday (idx 1), 30 days
const MONTH_CELLS = (() => {
  const cells = []
  const startWeekday = 1 // Monday
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= 30; day++) {
    const wIdx = (startWeekday + day - 1) % 7
    cells.push({ key: `Apr ${day}`, day, weekday: WEEKDAYS[wIdx] })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
})()

/* ─── Helpers ────────────────────────────────────────────────── */

function dateToKey(date) {
  const d = new Date(date)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`
}

function logsToEntries(logs) {
  const map = {}
  for (const log of logs) {
    const key = dateToKey(log.date)
    map[key] = log.entries.map(e => ({
      id: e.id,
      type: e.type,
      text: e.text,
      done: e.done,
    }))
  }
  return map
}

function getTaskProgress(entries) {
  const tasks = entries.filter(e => e.type === 'task' || e.type === 'priority')
  const done  = tasks.filter(e => e.done)
  return { total: tasks.length, done: done.length }
}

function getWeekDays(dateKey) {
  const info = DATES.find(d => d.key === dateKey) || DATES[0]
  const wIdx = WEEKDAYS.indexOf(info.weekday)
  return Array.from({ length: 7 }, (_, i) => {
    const offset = i - wIdx
    const day = info.day + offset
    const inMonth = day >= 1 && day <= 30
    if (inMonth) {
      return { key: `Apr ${day}`, day, month: 'Apr', weekday: WEEKDAYS[i], inMonth: true }
    }
    return {
      key: null,
      day: day < 1 ? 31 + day : day - 30,
      month: day < 1 ? 'Mar' : 'May',
      weekday: WEEKDAYS[i],
      inMonth: false,
    }
  })
}

/* ─── Shared Components ──────────────────────────────────────── */

function BulletSymbol({ type, done, onClick }) {
  const cfg = BULLET_TYPES[type]
  return (
    <span
      className={`entry-bullet ${cfg.colorClass}`}
      onClick={onClick}
      title={done ? 'Mark incomplete' : 'Mark complete'}
      style={{ opacity: done ? 0.45 : 1 }}
    >
      {done && (type === 'task' || type === 'priority') ? '✕' : cfg.symbol}
    </span>
  )
}

function EntryItem({ entry, onToggle, onDelete, animDelay }) {
  return (
    <div
      className="entry-item"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <BulletSymbol
        type={entry.type}
        done={entry.done}
        onClick={() => onToggle(entry.id, entry.done)}
      />
      <span className={`entry-text${entry.done ? ' done' : ''}`}>
        {entry.text}
      </span>
      <div className="entry-actions">
        <button
          className="entry-action-btn"
          onClick={() => onToggle(entry.id, entry.done)}
          title={entry.done ? 'Reopen' : 'Complete'}
        >
          {entry.done ? '↩' : '✓'}
        </button>
        <button
          className="entry-action-btn"
          onClick={() => onDelete(entry.id)}
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function AddEntryForm({ onAdd }) {
  const [text, setText]   = useState('')
  const [type, setType]   = useState('task')
  const inputRef          = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onAdd({ type, text: text.trim() })
    setText('')
    inputRef.current?.focus()
  }

  return (
    <form className="journal-add-form" onSubmit={submit}>
      <div className="add-form-type-selector">
        {Object.entries(BULLET_TYPES).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            className={`add-form-type-btn${type === key ? ` active ${key}-active` : ''}`}
            onClick={() => setType(key)}
          >
            <span style={{ fontSize: 13 }}>{cfg.symbol}</span>
            {cfg.label}
          </button>
        ))}
      </div>
      <div className="add-form-row">
        <span className={`add-form-symbol entry-bullet ${BULLET_TYPES[type].colorClass}`} style={{ margin: 0, cursor: 'default' }}>
          {BULLET_TYPES[type].symbol}
        </span>
        <input
          ref={inputRef}
          className="add-form-input"
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Add ${BULLET_TYPES[type].label.toLowerCase()}…`}
          autoComplete="off"
        />
        <button
          className="add-form-submit"
          type="submit"
          disabled={!text.trim()}
        >
          Record
        </button>
      </div>
      <p className="add-form-hint">Press Enter to add · Ctrl+/ to focus</p>
    </form>
  )
}

/* ─── Weekly View ────────────────────────────────────────────── */

function WeeklyView({ weekDays, entries, onToggle, onDelete, onSelectDate, setView }) {
  return (
    <div className="weekly-view">
      {weekDays.map((d, i) => {
        const dayEntries = d.inMonth ? (entries[d.key] || []) : []
        const isToday = d.key === TODAY
        return (
          <div key={i} className={`week-day-col${!d.inMonth ? ' out-of-month' : ''}`}>
            <div className={`week-day-header${isToday ? ' is-today' : ''}`}>
              <span className="week-day-name">{d.weekday}</span>
              <span className="week-day-num">{d.day}</span>
              <span className="week-day-month-label">{d.month}</span>
            </div>
            <div className="week-day-entries">
              {!d.inMonth ? (
                <div className="week-empty">·</div>
              ) : dayEntries.length === 0 ? (
                <div className="week-empty">◌</div>
              ) : (
                dayEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="week-entry"
                    title={entry.text}
                  >
                    <span className={`week-entry-bullet entry-bullet ${BULLET_TYPES[entry.type].colorClass}`}
                      style={{ opacity: entry.done ? 0.45 : 1, fontSize: 13, width: 'auto', height: 'auto', cursor: 'pointer', flexShrink: 0 }}
                      onClick={() => onToggle(entry.id, entry.done, d.key)}
                    >
                      {entry.done && (entry.type === 'task' || entry.type === 'priority')
                        ? '✕'
                        : BULLET_TYPES[entry.type].symbol}
                    </span>
                    <span className={`week-entry-text${entry.done ? ' done' : ''}`}>
                      {entry.text}
                    </span>
                  </div>
                ))
              )}
            </div>
            {d.inMonth && (
              <button
                className="week-go-daily-btn"
                onClick={() => { onSelectDate(d.key); setView('daily') }}
              >
                open day →
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── Monthly View ───────────────────────────────────────────── */

function MonthlyView({ entries, onSelectDate, setView }) {
  return (
    <div className="monthly-view">
      <div className="month-weekday-row">
        {WEEKDAYS.map(w => (
          <div key={w} className="month-weekday-label">{w}</div>
        ))}
      </div>
      <div className="month-grid">
        {MONTH_CELLS.map((cell, i) => {
          if (!cell) return <div key={i} className="month-cell empty" />
          const dayEntries = entries[cell.key] || []
          const isToday = cell.key === TODAY
          return (
            <div
              key={i}
              className={`month-cell${isToday ? ' is-today' : ''}${dayEntries.length > 0 ? ' has-entries' : ''}`}
              onClick={() => { onSelectDate(cell.key); setView('daily') }}
            >
              <span className="month-cell-day">{cell.day}</span>
              {dayEntries.length > 0 && (
                <div className="month-cell-dots">
                  {dayEntries.slice(0, 4).map((e, j) => (
                    <span key={j} className={`month-dot type-${e.type}`} />
                  ))}
                  {dayEntries.length > 4 && (
                    <span className="month-cell-more">+{dayEntries.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────── */

export default function BulletJournal({ logs, collections }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [entries, setEntries]           = useState(() => logsToEntries(logs))
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [entriesKey, setEntriesKey]     = useState(0)
  const [isDark, setIsDark]             = useState(false)
  const [view, setView]                 = useState('daily')

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
  }, [])

  const toggleTheme = useCallback(() => {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  useEffect(() => {
    setEntries(logsToEntries(logs))
  }, [logs])

  const currentEntries = entries[selectedDate] || []
  const { total, done } = getTaskProgress(currentEntries)
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

  const collectionsData = collections.map(c => ({
    id: c.id,
    icon: c.icon,
    name: c.name,
    count: c._count.items,
  }))

  const selectDate = useCallback((key) => {
    setSelectedDate(key)
    setEntriesKey(k => k + 1)
  }, [])

  // dateKey param lets weekly view specify which date's entries to mutate
  const handleToggle = useCallback((id, currentDone, dateKey) => {
    const key = dateKey ?? selectedDate
    setEntries(prev => ({
      ...prev,
      [key]: (prev[key] || []).map(e =>
        e.id === id ? { ...e, done: !e.done } : e
      ),
    }))
    startTransition(async () => {
      await toggleEntry(id, !currentDone)
      router.refresh()
    })
  }, [selectedDate, router])

  const handleDelete = useCallback((id, dateKey) => {
    const key = dateKey ?? selectedDate
    setEntries(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(e => e.id !== id),
    }))
    startTransition(async () => {
      await deleteEntry(id)
      router.refresh()
    })
  }, [selectedDate, router])

  const handleAdd = useCallback(({ type, text }) => {
    const tempEntry = { id: `temp-${Date.now()}`, type, text, done: false }
    setEntries(prev => ({
      ...prev,
      [selectedDate]: [...(prev[selectedDate] || []), tempEntry],
    }))
    startTransition(async () => {
      await addEntry(selectedDate, type, text)
      router.refresh()
    })
  }, [selectedDate, router])

  const currentDateInfo = DATES.find(d => d.key === selectedDate)
  const weekDays = getWeekDays(selectedDate)
  const weekStart = weekDays[0]
  const weekEnd = weekDays[6]

  return (
    <div className="journal-shell">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="journal-sidebar">

        <div className="sidebar-brand animate-slide-in">
          <div className="sidebar-brand-eyebrow">My</div>
          <div className="sidebar-brand-title">
            Bullet <span>Journal</span>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Collections</div>
        </div>
        {collectionsData.map(c => (
          <div key={c.id} className="sidebar-collection-item">
            <span className="sidebar-collection-icon">{c.icon}</span>
            <span className="sidebar-collection-name">{c.name}</span>
            <span className="sidebar-collection-count">{c.count}</span>
          </div>
        ))}

        <button className="theme-toggle" onClick={toggleTheme}>
          <span className="theme-toggle-icon">{isDark ? '○' : '●'}</span>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>

      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="journal-main dot-grid">

        {/* Header */}
        <div className="journal-header">

          {/* View tabs */}
          <div className="view-tabs">
            {['daily', 'weekly', 'monthly'].map(v => (
              <button
                key={v}
                className={`view-tab${view === v ? ' active' : ''}`}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {view === 'daily' && (
            <>
              <div className="journal-header-eyebrow">
                {currentDateInfo?.weekday} · {currentDateInfo?.month} 2026
              </div>
              <div className="journal-date-title">
                {currentDateInfo?.month} {currentDateInfo?.day}
                {selectedDate === TODAY && (
                  <span className="journal-today-badge">today</span>
                )}
              </div>
              <div className="journal-progress">
                <div className="journal-progress-bar-bg">
                  <div className="journal-progress-bar" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="journal-progress-label">
                  {total === 0
                    ? 'No tasks yet'
                    : `${done} of ${total} task${total !== 1 ? 's' : ''} done`}
                </span>
              </div>
            </>
          )}

          {view === 'weekly' && (
            <>
              <div className="journal-header-eyebrow">Week · Apr 2026</div>
              <div className="journal-date-title" style={{ fontSize: 36 }}>
                {weekStart.inMonth ? `Apr ${weekStart.day}` : `${weekStart.month} ${weekStart.day}`}
                <span style={{ fontSize: 24, opacity: 0.45, margin: '0 10px' }}>–</span>
                {weekEnd.inMonth ? `Apr ${weekEnd.day}` : `${weekEnd.month} ${weekEnd.day}`}
              </div>
            </>
          )}

          {view === 'monthly' && (
            <>
              <div className="journal-header-eyebrow">2026</div>
              <div className="journal-date-title">April</div>
            </>
          )}

        </div>

        {/* Legend — daily only */}
        {view === 'daily' && (
          <div className="bullet-legend">
            {Object.entries(BULLET_TYPES).map(([key, cfg]) => (
              <span key={key} className="bullet-legend-item">
                <span className={`entry-bullet ${cfg.colorClass}`} style={{ width: 'auto', height: 'auto', cursor: 'default', fontSize: 13 }}>
                  {cfg.symbol}
                </span>
                {cfg.label}
              </span>
            ))}
            <span className="bullet-legend-item" style={{ marginLeft: 'auto' }}>
              click bullet to complete
            </span>
          </div>
        )}

        {/* Content */}
        {view === 'daily' && (
          <>
            <div className="journal-entries" key={entriesKey}>
              {currentEntries.length === 0 ? (
                <div className="journal-entries-empty animate-fade-in">
                  <span className="journal-entries-empty-symbol">◌</span>
                  <span className="journal-entries-empty-text">
                    No entries yet — begin your log below
                  </span>
                </div>
              ) : (
                currentEntries.map((entry, i) => (
                  <EntryItem
                    key={entry.id}
                    entry={entry}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    animDelay={i * 40}
                  />
                ))
              )}
            </div>
            <AddEntryForm onAdd={handleAdd} />
          </>
        )}

        {view === 'weekly' && (
          <WeeklyView
            weekDays={weekDays}
            entries={entries}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onSelectDate={selectDate}
            setView={setView}
          />
        )}

        {view === 'monthly' && (
          <MonthlyView
            entries={entries}
            onSelectDate={selectDate}
            setView={setView}
          />
        )}

      </main>
    </div>
  )
}
