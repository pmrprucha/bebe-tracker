import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'

const AppCtx = createContext(null)
export const useApp = () => useContext(AppCtx)

export function AppProvider({ children }) {
  const [session, setSession]         = useState(null)
  const [profile, setProfile]         = useState(null)
  const [activeChild, setActiveChild] = useState(null)
  const [kids, setKids]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState(null)
  const [syncState, setSyncState]     = useState('idle')

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

  // ── Load profile + kids when session changes ────────
  useEffect(() => {
    if (!session) { setProfile(null); setKids([]); setLoading(false); return }
    loadUserData()
  }, [session])

  const loadUserData = async () => {
    setLoading(true)
    try {
      const { data: prof } = await sb
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(prof)

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
        const { data: fetched } = await sb.from('children').select('*').in('id', uniqueIds)
        setKids(fetched || [])
        const saved = localStorage.getItem('activeChildId')
        const match = (fetched || []).find(k => k.id === saved)
        setActiveChild(match || fetched?.[0] || null)
      } else {
        setKids([])
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

  // ── Permissions ──────────────────────────────────────
  const [permissions, setPermissions] = useState({})

  useEffect(() => {
    if (!session || !kids.length) return
    loadPermissions()
  }, [session, kids])

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
      activeChild, children: kids, switchChild, refreshChildren,
      loading, toast, showToast,
      syncState, setSyncState,
      canViewHistory, isParent,
      loadPermissions
    }}>
      {children}
    </AppCtx.Provider>
  )
}
