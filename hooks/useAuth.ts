import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

interface LocalUserData {
  id: string
  email: string
  username?: string
  avatar_url?: string
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [localUserData, setLocalUserData] = useState<LocalUserData | null>(null)
  const [loading, setLoading] = useState(true)

  // Get user data from localStorage
  const getLocalUserData = (): LocalUserData | null => {
    try {
      const userData = localStorage.getItem('musicapp_user')
      if (userData) {
        const parsed = JSON.parse(userData)
        console.log('📱 Retrieved user data from localStorage:', parsed)
        return parsed
      }
      console.log('📱 No user data found in localStorage')
      return null
    } catch (error) {
      console.error('❌ Error parsing localStorage user data:', error)
      return null
    }
  }

  // Save user data to localStorage
  const saveLocalUserData = (userData: LocalUserData) => {
    try {
      localStorage.setItem('musicapp_user', JSON.stringify(userData))
      console.log('💾 Saved user data to localStorage:', userData)
      setLocalUserData(userData)
    } catch (error) {
      console.error('❌ Error saving user data to localStorage:', error)
    }
  }

  // Clear user data from localStorage
  const clearLocalUserData = () => {
    try {
      localStorage.removeItem('musicapp_user')
      console.log('🗑️ Cleared user data from localStorage')
      setLocalUserData(null)
    } catch (error) {
      console.error('❌ Error clearing localStorage:', error)
    }
  }

  useEffect(() => {
    let mounted = true
    console.log('🔄 useAuth effect started')

    // Check localStorage first for immediate user data
    const localData = getLocalUserData()
    if (localData) {
      setLocalUserData(localData)
      console.log('✅ Using localStorage user data for immediate access')
    }

    // Get initial session with timeout
    const getInitialSession = async () => {
      try {
        console.log('🔍 Checking for existing session...')
        
        // Set a timeout for the session check
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 8000)
        )

        const { data: { session }, error } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as any

        if (error) {
          console.error('❌ Session error:', error)
          if (mounted) {
            // If session fails but we have local data, use it
            if (localData) {
              console.log('⚠️ Session failed but using localStorage data')
              setUser(null) // No session user but keep local data
              setLoading(false)
            } else {
              console.log('❌ No session and no localStorage data')
              setUser(null)
              setLocalUserData(null)
              setLoading(false)
            }
          }
          return
        }

        if (mounted) {
          if (session?.user) {
            console.log('✅ Valid session found for user:', session.user.email)
            setUser(session.user)
            
            // Update localStorage with fresh session data
            const userData: LocalUserData = {
              id: session.user.id,
              email: session.user.email!,
              username: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
              avatar_url: session.user.user_metadata?.avatar_url
            }
            saveLocalUserData(userData)
          } else {
            console.log('❌ No valid session found')
            // If no session but we have local data, keep using it
            if (!localData) {
              setUser(null)
              setLocalUserData(null)
            }
          }
          setLoading(false)
        }
      } catch (error) {
        console.error('❌ Failed to get session:', error)
        if (mounted) {
          // If session check fails but we have local data, use it
          if (localData) {
            console.log('⚠️ Session check failed but using localStorage data')
            setUser(null)
            setLoading(false)
          } else {
            console.log('❌ Session check failed and no localStorage data')
            setUser(null)
            setLocalUserData(null)
            setLoading(false)
          }
        }
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.email)
        
        if (!mounted) return

        if (event === 'SIGNED_OUT' || !session) {
          console.log('👋 User signed out')
          setUser(null)
          clearLocalUserData()
          setLoading(false)
          return
        }

        if (event === 'SIGNED_IN' && session?.user) {
          console.log('👋 User signed in:', session.user.email)
          setUser(session.user)
          setLoading(false)

          // Save user data to localStorage
          const userData: LocalUserData = {
            id: session.user.id,
            email: session.user.email!,
            username: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
            avatar_url: session.user.user_metadata?.avatar_url
          }
          saveLocalUserData(userData)

          // Update last_login when user signs in
          try {
            console.log('📝 Updating user data in database...')
            await supabase
              .from('users')
              .upsert({
                id: session.user.id,
                email: session.user.email!,
                username: userData.username,
                avatar_url: userData.avatar_url,
                last_login: new Date().toISOString()
              })
            console.log('✅ User data updated in database')
          } catch (error) {
            console.error('❌ Error updating user data:', error)
          }
        } else {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
      console.log('🔄 useAuth cleanup completed')
    }
  }, [])

  const signInWithGoogle = async () => {
    try {
      console.log('🔐 Starting Google sign in...')
      setLoading(true)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      if (error) {
        console.error('❌ Error signing in:', error)
        setLoading(false)
      } else {
        console.log('✅ Google sign in initiated')
      }
    } catch (error) {
      console.error('❌ Sign in error:', error)
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      console.log('👋 Starting sign out...')
      setLoading(true)
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('❌ Error signing out:', error)
      } else {
        console.log('✅ Successfully signed out')
      }
      // Clear all cached data
      localStorage.clear()
      sessionStorage.clear()
      clearLocalUserData()
      setUser(null)
      setLoading(false)
    } catch (error) {
      console.error('❌ Sign out error:', error)
      setLoading(false)
    }
  }

  // Return both session user and local user data
  // Priority: use session user if available, otherwise use local data
  const effectiveUser = user || (localUserData
  ? ({
      id: localUserData.id,
      email: localUserData.email,
      user_metadata: {
        full_name: localUserData.username,
        name: localUserData.username,
        avatar_url: localUserData.avatar_url
      }
    } as unknown as User)
  : null)

  return {
    user: effectiveUser,
    localUserData,
    loading,
    signInWithGoogle,
    signOut,
    getUserId: () => localUserData?.id || user?.id || null,
    isAuthenticated: !!(localUserData || user)
  }
}
