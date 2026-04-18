'use client'

import { useState, useRef, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addEntry, toggleEntry, deleteEntry,
  createCollection, deleteCollection,
  addCollectionItem, toggleCollectionItem, deleteCollectionItem,
} from './actions'

/* ─── Config ─────────────────────────────────────────────────── */

const BULLET_TYPES = {
  task:     { symbol: '•',  label: 'Task',     colorClass: 'type-task' },
  event:    { symbol: '◯',  label: 'Event',    colorClass: 'type-event' },
  note:     { symbol: '—',  label: 'Note',     colorClass: 'type-note' },
  priority: { symbol: '★',  label: 'Priority', colorClass: 'type-priority' },
}

const WEEKDAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Key format: "YYYY-MM-DD" (local time)
function makeKey(year, month0, day) {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Today in local time
const _now = new Date()
const TODAY = makeKey(_now.getFullYear(), _now.getMonth(), _now.getDate())

// 14 days ending today (for the date picker strip)
const DATES = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - i)
  return {
    key:     makeKey(d.getFullYear(), d.getMonth(), d.getDate()),
    day:     d.getDate(),
    month:   MONTH_SHORT[d.getMonth()],
    weekday: WEEKDAYS[d.getDay()],
    year:    d.getFullYear(),
  }
})

// Shift a "YYYY-MM-DD" key by N days
function offsetDate(key, days) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return makeKey(dt.getFullYear(), dt.getMonth(), dt.getDate())
}

// Build month grid cells for any year/month0
function buildMonthCells(year, month0) {
  const cells        = []
  const startWeekday = new Date(year, month0, 1).getDay()
  const daysInMonth  = new Date(year, month0 + 1, 0).getDate()
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key:     makeKey(year, month0, day),
      day,
      weekday: WEEKDAYS[new Date(year, month0, day).getDay()],
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/* ─── Helpers ────────────────────────────────────────────────── */

// DB stores UTC midnight — use UTC methods to recover the calendar date
function dateToKey(date) {
  const d = new Date(date)
  return makeKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Parse a "YYYY-MM-DD" key into display fields
function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return {
    year:       y,
    month:      MONTH_SHORT[m - 1],
    monthLong:  MONTH_LONG[m - 1],
    day:        d,
    weekday:    WEEKDAYS[dt.getDay()],
  }
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
  const [y, m, d] = dateKey.split('-').map(Number)
  const base = new Date(y, m - 1, d)
  const wIdx = base.getDay()
  return Array.from({ length: 7 }, (_, i) => {
    const dt      = new Date(y, m - 1, d + (i - wIdx))
    const inMonth = dt.getMonth() === (m - 1) && dt.getFullYear() === y
    return {
      key:     makeKey(dt.getFullYear(), dt.getMonth(), dt.getDate()),
      day:     dt.getDate(),
      month:   MONTH_SHORT[dt.getMonth()],
      weekday: WEEKDAYS[dt.getDay()],
      inMonth,
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

/* ─── New Collection Form (sidebar) ─────────────────────────── */

function NewCollectionForm({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('◎')
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim(), icon.trim() || '◎')
  }

  return (
    <form className="new-collection-form" onSubmit={submit}>
      <input
        type="text"
        className="new-collection-icon-input"
        value={icon}
        onChange={e => setIcon(e.target.value)}
        maxLength={2}
        placeholder="◎"
      />
      <input
        ref={nameRef}
        type="text"
        className="new-collection-name-input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Collection name"
      />
      <div className="new-collection-btns">
        <button type="submit" className="new-collection-save" disabled={!name.trim()}>✓</button>
        <button type="button" className="new-collection-cancel" onClick={onCancel}>✕</button>
      </div>
    </form>
  )
}

/* ─── Collection View ────────────────────────────────────────── */

function CollectionView({ collection, onAddItem, onToggleItem, onDeleteItem, onDeleteCollection }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  const items = collection.items
  const total = items.length
  const done  = items.filter(i => i.done).length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onAddItem(collection.id, text.trim())
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="collection-view-wrapper">
      <div className="journal-header">
        <div className="journal-header-eyebrow">Collection</div>
        <div className="journal-date-title" style={{ fontSize: 42 }}>
          <span style={{ fontSize: 36, lineHeight: 1 }}>{collection.icon}</span>
          {collection.name}
          <button
            className="collection-delete-btn"
            onClick={() => onDeleteCollection(collection.id)}
            title="Delete collection"
          >
            ✕
          </button>
        </div>
        <div className="journal-progress">
          <div className="journal-progress-bar-bg">
            <div className="journal-progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <span className="journal-progress-label">
            {total === 0 ? 'No items yet' : `${done} of ${total} done`}
          </span>
        </div>
      </div>

      <div className="journal-entries">
        {items.length === 0 ? (
          <div className="journal-entries-empty animate-fade-in">
            <span className="journal-entries-empty-symbol">◌</span>
            <span className="journal-entries-empty-text">No items — add one below</span>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={item.id} className="entry-item" style={{ animationDelay: `${i * 40}ms` }}>
              <span
                className="entry-bullet type-task"
                onClick={() => onToggleItem(item.id, item.done, collection.id)}
                style={{ opacity: item.done ? 0.45 : 1 }}
              >
                {item.done ? '✕' : '•'}
              </span>
              <span className={`entry-text${item.done ? ' done' : ''}`}>{item.text}</span>
              <div className="entry-actions">
                <button
                  className="entry-action-btn"
                  onClick={() => onToggleItem(item.id, item.done, collection.id)}
                  title={item.done ? 'Reopen' : 'Complete'}
                >
                  {item.done ? '↩' : '✓'}
                </button>
                <button
                  className="entry-action-btn"
                  onClick={() => onDeleteItem(item.id, collection.id)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form className="journal-add-form" onSubmit={submit}>
        <div className="add-form-row">
          <span className="entry-bullet type-task" style={{ margin: 0, cursor: 'default', fontSize: 13 }}>•</span>
          <input
            ref={inputRef}
            className="add-form-input"
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Add item…"
            autoComplete="off"
          />
          <button className="add-form-submit" type="submit" disabled={!text.trim()}>Add</button>
        </div>
      </form>
    </div>
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

function MonthlyView({ entries, monthCells, onSelectDate, setView }) {
  return (
    <div className="monthly-view">
      <div className="month-weekday-row">
        {WEEKDAYS.map(w => (
          <div key={w} className="month-weekday-label">{w}</div>
        ))}
      </div>
      <div className="month-grid">
        {monthCells.map((cell, i) => {
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

  const [entries, setEntries]                   = useState(() => logsToEntries(logs))
  const [selectedDate, setSelectedDate]         = useState(TODAY)
  const [entriesKey, setEntriesKey]             = useState(0)
  const [isDark, setIsDark]                     = useState(false)
  const [view, setView]                         = useState('daily')
  const [activeCollection, setActiveCollection]   = useState(null)
  const [newCollectionOpen, setNewCollectionOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState({ year: _now.getFullYear(), month: _now.getMonth() })
  const [collectionsState, setCollectionsState] = useState(() =>
    collections.map(c => ({
      id: c.id, icon: c.icon, name: c.name,
      items: (c.items || []).map(i => ({ id: i.id, text: i.text, done: i.done })),
    }))
  )

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

  useEffect(() => {
    setCollectionsState(collections.map(c => ({
      id: c.id, icon: c.icon, name: c.name,
      items: (c.items || []).map(i => ({ id: i.id, text: i.text, done: i.done })),
    })))
  }, [collections])

  const currentEntries = entries[selectedDate] || []
  const { total, done } = getTaskProgress(currentEntries)
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

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

  const handleCreateCollection = useCallback((name, icon) => {
    const tempId = `temp-${Date.now()}`
    setCollectionsState(prev => [...prev, { id: tempId, name, icon, items: [] }])
    setActiveCollection(tempId)
    startTransition(async () => {
      await createCollection(name, icon)
      router.refresh()
    })
  }, [router])

  const handleDeleteCollection = useCallback((id) => {
    setCollectionsState(prev => prev.filter(c => c.id !== id))
    setActiveCollection(null)
    startTransition(async () => {
      await deleteCollection(id)
      router.refresh()
    })
  }, [router])

  const handleAddItem = useCallback((collectionId, text) => {
    const tempItem = { id: `temp-${Date.now()}`, text, done: false }
    setCollectionsState(prev => prev.map(c =>
      c.id === collectionId ? { ...c, items: [...c.items, tempItem] } : c
    ))
    startTransition(async () => {
      await addCollectionItem(collectionId, text)
      router.refresh()
    })
  }, [router])

  const handleToggleItem = useCallback((itemId, currentDone, collectionId) => {
    setCollectionsState(prev => prev.map(c =>
      c.id === collectionId
        ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i) }
        : c
    ))
    startTransition(async () => {
      await toggleCollectionItem(itemId, !currentDone)
      router.refresh()
    })
  }, [router])

  const handleDeleteItem = useCallback((itemId, collectionId) => {
    setCollectionsState(prev => prev.map(c =>
      c.id === collectionId
        ? { ...c, items: c.items.filter(i => i.id !== itemId) }
        : c
    ))
    startTransition(async () => {
      await deleteCollectionItem(itemId)
      router.refresh()
    })
  }, [router])

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

  const currentDateInfo = parseKey(selectedDate)
  const weekDays  = getWeekDays(selectedDate)
  const weekStart = weekDays[0]
  const weekEnd   = weekDays[6]
  const monthCells = buildMonthCells(viewMonth.year, viewMonth.month)

  const prevMonth = () => setViewMonth(({ year, month }) => {
    const d = new Date(year, month - 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const nextMonth = () => setViewMonth(({ year, month }) => {
    const d = new Date(year, month + 1, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

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

        <div className="sidebar-collections-section">
          <div className="sidebar-collections-header">
            <span className="sidebar-collections-label">Collections</span>
            <button
              className="sidebar-add-btn"
              onClick={() => setNewCollectionOpen(o => !o)}
              title="New collection"
            >+</button>
          </div>
          {newCollectionOpen && (
            <NewCollectionForm
              onAdd={(name, icon) => {
                handleCreateCollection(name, icon)
                setNewCollectionOpen(false)
              }}
              onCancel={() => setNewCollectionOpen(false)}
            />
          )}
          {collectionsState.map(c => (
            <div
              key={c.id}
              className={`sidebar-collection-item${activeCollection === c.id ? ' active' : ''}`}
              onClick={() => setActiveCollection(c.id)}
            >
              <span className="sidebar-collection-icon">{c.icon}</span>
              <span className="sidebar-collection-name">{c.name}</span>
              <span className="sidebar-collection-count">{c.items.length}</span>
            </div>
          ))}
        </div>

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
                className={`view-tab${view === v && !activeCollection ? ' active' : ''}`}
                onClick={() => { setView(v); setActiveCollection(null) }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {!activeCollection && view === 'daily' && (
            <>
              <div className="journal-header-eyebrow">
                {currentDateInfo.weekday} · {currentDateInfo.month} {currentDateInfo.year}
              </div>
              <div className="journal-nav-row">
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, -1))}>←</button>
                <div className="journal-date-title">
                  {currentDateInfo.month} {currentDateInfo.day}
                  {selectedDate === TODAY && (
                    <span className="journal-today-badge">today</span>
                  )}
                </div>
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, 1))}>→</button>
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

          {!activeCollection && view === 'weekly' && (
            <>
              <div className="journal-header-eyebrow">Week · {parseKey(selectedDate).month} {parseKey(selectedDate).year}</div>
              <div className="journal-nav-row">
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, -7))}>←</button>
                <div className="journal-date-title" style={{ fontSize: 36 }}>
                  {weekStart.month} {weekStart.day}
                  <span style={{ fontSize: 24, opacity: 0.45, margin: '0 10px' }}>–</span>
                  {weekEnd.month} {weekEnd.day}
                </div>
                <button className="nav-btn" onClick={() => selectDate(offsetDate(selectedDate, 7))}>→</button>
              </div>
            </>
          )}

          {!activeCollection && view === 'monthly' && (
            <>
              <div className="journal-header-eyebrow">{viewMonth.year}</div>
              <div className="journal-nav-row">
                <button className="nav-btn" onClick={prevMonth}>←</button>
                <div className="journal-date-title">{MONTH_LONG[viewMonth.month]}</div>
                <button className="nav-btn" onClick={nextMonth}>→</button>
              </div>
            </>
          )}

        </div>

        {/* Collection view */}
        {activeCollection && (() => {
          const col = collectionsState.find(c => c.id === activeCollection)
          return col ? (
            <CollectionView
              collection={col}
              onAddItem={handleAddItem}
              onToggleItem={handleToggleItem}
              onDeleteItem={handleDeleteItem}
              onDeleteCollection={handleDeleteCollection}
            />
          ) : null
        })()}

        {/* Legend — daily only */}
        {!activeCollection && view === 'daily' && (
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
        {!activeCollection && view === 'daily' && (
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

        {!activeCollection && view === 'weekly' && (
          <WeeklyView
            weekDays={weekDays}
            entries={entries}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onSelectDate={selectDate}
            setView={setView}
          />
        )}

        {!activeCollection && view === 'monthly' && (
          <MonthlyView
            entries={entries}
            monthCells={monthCells}
            onSelectDate={selectDate}
            setView={setView}
          />
        )}

      </main>
    </div>
  )
}
