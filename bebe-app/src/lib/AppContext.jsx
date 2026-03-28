import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }) {
  const [session, setSession]         = useState(null)
  const [profile, setProfile]         = useState(null)
  const [activeChild, setActiveChild] = useState(null)
  const [children, setChildren]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [syncState, setSyncState]     = useState('idle') // idle | syncing | ok | err

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  // ── Auth ────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load profile + children when session changes ────
  useEffect(() => {
    if (!session) { setProfile(null); setChildren([]); setLoading(false); return }
    loadUserData()
  }, [session])

  const loadUserData = async () => {
    setLoading(true)
    try {
      // profile
      const { data: prof } = await sb
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(prof)

      // children: via family_members OR caregivers
      const [fmRes, cgRes] = await Promise.all([
        sb.from('family_members').select('child_id, is_parent, approved').eq('profile_id', session.user.id).eq('approved', true),
        sb.from('caregivers').select('child_id, approved').eq('profile_id', session.user.id).eq('approved', true)
      ])

      const childIds = [
        ...(fmRes.data || []).map(r => r.child_id),
        ...(cgRes.data || []).map(r => r.child_id)
      ]
      const uniqueIds = [...new Set(childIds)]

      if (uniqueIds.length) {
        const { data: kids } = await sb.from('children').select('*').in('id', uniqueIds)
        setChildren(kids || [])
        // restore active child from localStorage
        const saved = localStorage.getItem('activeChildId')
        const match = (kids || []).find(k => k.id === saved)
        setActiveChild(match || kids?.[0] || null)
      } else {
        setChildren([])
        setActiveChild(null)
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  const switchChild = (child) => {
    setActiveChild(child)
    localStorage.setItem('activeChildId', child.id)
  }

  const refreshChildren = () => loadUserData()

  // ── Permission helpers ───────────────────────────────
  const [permissions, setPermissions] = useState({}) // childId -> { isParent, isCaregiver, canViewHistory }

  useEffect(() => {
    if (!session || !children.length) return
    loadPermissions()
  }, [session, children])

  const loadPermissions = async () => {
    const uid = session.user.id
    const [fmRes, cgRes] = await Promise.all([
      sb.from('family_members').select('child_id, is_parent').eq('profile_id', uid).eq('approved', true),
      sb.from('caregivers').select('child_id').eq('profile_id', uid).eq('approved', true)
    ])
    const perms = {}
    ;(fmRes.data || []).forEach(r => {
      perms[r.child_id] = { isParent: r.is_parent, isCaregiver: false, canViewHistory: true }
    })
    ;(cgRes.data || []).forEach(r => {
      if (!perms[r.child_id]) perms[r.child_id] = { isParent: false, isCaregiver: true, canViewHistory: true }
      else perms[r.child_id].isCaregiver = true
    })
    setPermissions(perms)
  }

  const canViewHistory = (childId) => permissions[childId]?.canViewHistory ?? false
  const isParent = (childId) => permissions[childId]?.isParent ?? false

  return (
    <AppCtx.Provider value={{
      session, profile, setProfile,
      activeChild, children, switchChild, refreshChildren,
      loading, toast, showToast,
      syncState, setSyncState,
      canViewHistory, isParent,
      loadPermissions
    }}>
      {children}
    </AppCtx.Provider>
  )
}
