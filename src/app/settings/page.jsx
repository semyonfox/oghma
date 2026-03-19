'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'
import { MagnifyingGlassIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import LanguageSelector from '@/components/common/LanguageSelector'
import CanvasIntegration from '@/components/settings/canvas-integration'
import CanvasImportStatus from '@/components/CanvasImportStatus'
import useI18n from '@/lib/notes/hooks/use-i18n'
import { useSettingsStore } from '@/lib/notes/state/ui/settings'
import { DEFAULT_SETTINGS } from '@/lib/notes/types/settings'

// Navigation items will be created dynamically with useI18n
// See below in component for definition

export default function SettingsPage() {
  const router = useRouter()
  const { t } = useI18n()
  const { settings, setSettings, updateSettings } = useSettingsStore()
  const [formState, setFormState] = useState({
    firstName: '',
    lastName: '',
    email: '',
    timezone: 'UTC',
    theme: 'dark',
    editorWidth: 'large',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('account')
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarInputRef = useRef(null)
  const [clearVaultConfirm, setClearVaultConfirm] = useState(false)
  const [clearVaultInput, setClearVaultInput] = useState('')
  const [isClearingVault, setIsClearingVault] = useState(false)
  const [deleteAccountModal, setDeleteAccountModal] = useState(false)
  const [deleteAccountInput, setDeleteAccountInput] = useState('')
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  const DELETE_ACCOUNT_PHRASE = 'delete my account'

  const VAULT_CONFIRM_PHRASE = "I solemnly swear on my academic career that I, a person of sound mind and questionable study habits, do hereby voluntarily and irrevocably consent to the total and utter annihilation of every single note, file, and folder in my vault, fully understanding that they are gone forever and that this is entirely my own fault"

  const secondaryNavigation = [
    { name: t('Account'), href: '#account', current: true },
    { name: t('Notifications'), href: '#notifications', current: false },
    { name: t('Billing'), href: '#billing', current: false },
    { name: t('Canvas Integration'), href: '#canvas', current: false },
    { name: t('AI Settings'), href: '#ai', current: false },
    { name: t('Data & Export'), href: '#data', current: false },
    { name: t('Danger Zone'), href: '#danger', current: false },
  ]

  // Load user profile and settings on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Fetch user profile (includes OAuth data from Auth.js session)
        const profileResponse = await fetch('/api/auth/me')
        if (profileResponse.ok) {
          const { user } = await profileResponse.json()
          if (user) {
            const nameParts = (user.name || '').split(' ')
            setFormState((prev) => ({
              ...prev,
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              email: user.email || '',
            }))
          }
        }

        // Fetch user settings (theme, editor size, timezone, etc.)
        const settingsResponse = await fetch('/api/settings')
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json()
          setSettings(settingsData)
          // Update form state with loaded settings
          setFormState((prev) => ({
            ...prev,
            theme: settingsData.theme || 'dark',
            editorWidth: settingsData.editorsize === 'small' ? 'small' : 'large',
            timezone: settingsData.timezone || 'UTC',
          }))
        }

        // Fetch current avatar
        const avatarResponse = await fetch('/api/auth/avatar')
        if (avatarResponse.ok) {
          const { avatarUrl: url } = await avatarResponse.json()
          if (url) setAvatarUrl(url)
        }
      } catch (error) {
        console.error('Failed to load user data:', error)
      }
    }
    loadUserData()
  }, [setSettings])

  // Track active section when user scrolls
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['account', 'notifications', 'billing', 'data', 'canvas', 'danger']
      for (const section of sections) {
        const element = document.getElementById(section)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= 200 && rect.bottom >= 0) {
            setActiveSection(section)
            break
          }
        }
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNavClick = (item) => {
    const element = document.querySelector(item.href)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      // Save profile data (timezone) via settings API
      // Note: firstName, lastName, email are from OAuth/Auth and typically read-only
      // But we can save them as preferences in case user wants to override display names
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: formState.timezone,
          // Store profile display preferences
          firstName: formState.firstName,
          lastName: formState.lastName,
        }),
      })
      
      if (response.ok) {
        toast.success(t('Profile updated successfully'))
      } else {
        const error = await response.json()
        toast.error(error.error || t('Failed to save profile'))
      }
    } catch (error) {
      console.error('Failed to save profile:', error)
      toast.error(t('Failed to save profile'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditorSettingsSave = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await updateSettings({
        theme: formState.theme,
        editorsize: formState.editorWidth === 'small' ? 'small' : 'large',
      })
      toast.success(t('Editor settings saved'))
    } catch (error) {
      console.error('Failed to save editor settings:', error)
      toast.error(t('Failed to save settings'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearVault = async () => {
    setIsClearingVault(true)
    try {
      const res = await fetch('/api/vault', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? t('Failed to clear vault'))
        return
      }
      const { summary } = data
      toast.success(
        `${t('Vault cleared')} — ${summary.notesDeleted} ${t('notes')}, ${summary.s3FilesDeleted} ${t('files deleted')}`
      )
      setClearVaultConfirm(false)
    } catch {
      toast.error(t('Failed to clear vault'))
    } finally {
      setIsClearingVault(false)
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true)
    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: DELETE_ACCOUNT_PHRASE }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? t('Failed to delete account'))
        return
      }
      router.push('/login')
    } catch {
      toast.error(t('Failed to delete account'))
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (formState.newPassword !== formState.confirmPassword) {
      toast.error(t('Passwords do not match'))
      return
    }
    if (formState.newPassword.length < 8) {
      toast.error(t('Password must be at least 8 characters'))
      return
    }
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formState.currentPassword,
          newPassword: formState.newPassword,
        }),
      })
      if (response.ok) {
        toast.success(t('Password changed successfully'))
        setFormState((prev) => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }))
      } else {
        toast.error(t('Failed to change password'))
      }
    } catch (error) {
      console.error('Failed to change password:', error)
      toast.error(t('Failed to change password'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // show local preview immediately
    const objectUrl = URL.createObjectURL(file)
    setAvatarPreview(objectUrl)

    setIsUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)

      const response = await fetch('/api/auth/avatar', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const { avatarUrl: newUrl } = await response.json()
        setAvatarUrl(newUrl)
        setAvatarPreview(null)
        toast.success(t('Avatar updated successfully'))
      } else {
        const err = await response.json()
        setAvatarPreview(null)
        toast.error(err.error || t('Failed to upload avatar'))
      }
    } catch (error) {
      console.error('Avatar upload failed:', error)
      setAvatarPreview(null)
      toast.error(t('Failed to upload avatar'))
    } finally {
      setIsUploadingAvatar(false)
      // reset input so the same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  return (
    <div className="bg-background min-h-screen">
      {/* Top bar with search and back button */}
      <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-6 border-b border-border-subtle bg-background px-4 sm:px-6 lg:px-8 sm:hidden">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text hover:bg-white/5 p-2"
                title={t('Back')}
              >
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
              <div className="flex flex-1 gap-x-4 self-stretch">
                <form action="#" method="GET" className="grid flex-1 grid-cols-1">
                  <input
                    name="search"
                    placeholder={t('Search settings')}
                    aria-label={t('Search')}
                    className="col-start-1 row-start-1 block size-full bg-transparent pl-8 text-base text-text outline-hidden placeholder:text-text-tertiary sm:text-sm/6"
                  />
                  <MagnifyingGlassIcon
                    aria-hidden="true"
                    className="pointer-events-none col-start-1 row-start-1 size-5 self-center text-text-tertiary"
                  />
                </form>
              </div>
            </div>

      {/* Back button for larger screens */}
      <div className="hidden sm:flex px-4 py-4 sm:px-6 lg:px-8 border-b border-border-subtle">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary-400 hover:text-indigo-300"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                {t('Back')}
              </button>
            </div>

      {/* Secondary navigation */}
      <header className="border-b border-border-subtle sticky top-16 z-30 bg-background">
        <nav className="flex overflow-x-auto py-4">
          <ul
            role="list"
            className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold text-text-tertiary sm:px-6 lg:px-8"
          >
            {secondaryNavigation.map((item) => {
                   const sectionId = item.href.replace('#', '')
                   const isActive = activeSection === sectionId
                   return (
                     <li key={item.name}>
                       <a 
                         href={item.href} 
                          className={isActive ? 'text-primary-400 border-b-2 border-primary-500 pb-4' : 'hover:text-text-secondary'}
                         onClick={(e) => {
                           e.preventDefault()
                           handleNavClick(item)
                         }}
                       >
                         {item.name}
                       </a>
                     </li>
                   )
            })}
          </ul>
        </nav>
      </header>

      {/* Main content */}
      <main className="divide-y divide-white/10">
        {/* Account Settings */}
        <div id="account" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
               <div>
                 <h2 className="text-base/7 font-semibold text-text">{t('Personal Information')}</h2>
                 <p className="mt-1 text-sm/6 text-text-tertiary">{t('Update your profile information and avatar.')}</p>
               </div>

              <form className="md:col-span-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                   {/* Profile Avatar */}
                   <div className="col-span-full flex items-center gap-x-8">
                     {/* hidden file input */}
                     <input
                       ref={avatarInputRef}
                       type="file"
                       accept="image/*"
                       className="hidden"
                       onChange={handleAvatarFileChange}
                     />
                     {avatarPreview || avatarUrl ? (
                       <img
                         alt={t('Profile')}
                         src={avatarPreview || avatarUrl}
                         className="size-24 flex-none rounded-lg bg-surface object-cover outline -outline-offset-1 outline-white/10"
                       />
                     ) : (
                       <div className="size-24 flex-none rounded-lg bg-surface flex items-center justify-center outline -outline-offset-1 outline-white/10">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-12 text-text-tertiary">
                           <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
                         </svg>
                       </div>
                     )}
                     <div>
                       <button
                         type="button"
                         disabled={isUploadingAvatar}
                         className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/5 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                         onClick={() => avatarInputRef.current?.click()}
                       >
                         {isUploadingAvatar && (
                           <svg className="animate-spin size-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                           </svg>
                         )}
                         {isUploadingAvatar ? t('Uploading...') : t('Change avatar')}
                       </button>
                       <p className="mt-2 text-xs/5 text-text-tertiary">{t('JPG, GIF, PNG or WebP. 5 MB max.')}</p>
                     </div>
                   </div>

                    {/* First Name */}
                    <div className="sm:col-span-3">
                       <label htmlFor="first-name" className="block text-sm/6 font-medium text-text">
                         {t('First name')}
                       </label>
                     <div className="mt-2">
                       <input
                          id="first-name"
                          name="first-name"
                          type="text"
                          autoComplete="given-name"
                          placeholder={t('John')}
                          value={formState.firstName}
                         onChange={(e) => setFormState((prev) => ({ ...prev, firstName: e.target.value }))}
                          className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                        />
                      </div>
                    </div>

                     {/* Last Name */}
                    <div className="sm:col-span-3">
                       <label htmlFor="last-name" className="block text-sm/6 font-medium text-text">
                         {t('Last name')}
                       </label>
                     <div className="mt-2">
                       <input
                          id="last-name"
                          name="last-name"
                          type="text"
                          autoComplete="family-name"
                          placeholder={t('Doe')}
                          value={formState.lastName}
                         onChange={(e) => setFormState((prev) => ({ ...prev, lastName: e.target.value }))}
                          className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                        />
                      </div>
                    </div>

                     {/* Email */}
                    <div className="col-span-full">
                       <label htmlFor="email" className="block text-sm/6 font-medium text-text">
                         {t('Email address')}
                       </label>
                     <div className="mt-2">
                       <input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder={t('john@example.com')}
                          value={formState.email}
                         onChange={(e) => setFormState((prev) => ({ ...prev, email: e.target.value }))}
                          className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                        />
                      </div>
                    </div>

                     {/* Timezone */}
                    <div className="col-span-full">
                       <label htmlFor="timezone" className="block text-sm/6 font-medium text-text">
                         {t('Timezone')}
                       </label>
                     <div className="mt-2 grid grid-cols-1">
                        <select
                           id="timezone"
                           name="timezone"
                           value={formState.timezone}
                           onChange={(e) => setFormState((prev) => ({ ...prev, timezone: e.target.value }))}
                           className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white/5 py-1.5 pr-8 pl-3 text-base text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                           style={{
                             colorScheme: 'dark'
                           }}
                         >
                          <option>{t('UTC')}</option>
                          <option>{t('Pacific Standard Time')}</option>
                          <option>{t('Eastern Standard Time')}</option>
                          <option>{t('Greenwich Mean Time')}</option>
                          <option>{t('Central European Time')}</option>
                        </select>
                      <ChevronDownIcon
                        aria-hidden="true"
                         className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-text-tertiary sm:size-4"
                      />
                    </div>
                   </div>

                   {/* Language Selection */}
                   <div className="col-span-full">
                     <LanguageSelector variant="compact" showLabel={true} />
                   </div>
                 </div>

                  <div className="mt-8 flex">
                     <button
                       type="submit"
                       disabled={isLoading}
                       className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                       onClick={handleProfileSave}
                     >
                       {isLoading ? t('Saving...') : t('Save changes')}
                     </button>
                   </div>
               </form>
             </div>

              {/* Editor & Theme Settings (Notifications section) */}
              <div id="notifications" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
                <div>
                   <h2 className="text-base/7 font-semibold text-text">{t('Editor & Theme')}</h2>
                   <p className="mt-1 text-sm/6 text-text-tertiary">{t('Customize your note editor appearance and behavior.')}</p>
                </div>

               <form className="md:col-span-2">
                 <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl">
                    {/* Theme Selection */}
                    <div>
                       <label className="block text-sm/6 font-medium text-text mb-3">{t('Theme')}</label>
                      <div className="flex gap-3">
                        {[{ label: t('Light'), value: 'light' }, { label: t('Dark'), value: 'dark' }, { label: t('System'), value: 'system' }].map((theme) => (
                          <label key={theme.value} className="flex items-center cursor-pointer">
                            <input
                              type="radio"
                              name="theme"
                              value={theme.value}
                              checked={formState.theme === theme.value}
                              onChange={(e) => setFormState((prev) => ({ ...prev, theme: e.target.value }))}
                              className="mr-2"
                            />
                             <span className="text-sm text-text-secondary">{theme.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Editor Width */}
                    <div>
                       <label className="block text-sm/6 font-medium text-text mb-3">{t('Editor Width')}</label>
                      <div className="flex gap-3">
                        {[{ label: t('Small'), value: 'small' }, { label: t('Large'), value: 'large' }].map((size) => (
                          <label key={size.value} className="flex items-center cursor-pointer">
                            <input
                              type="radio"
                              name="editor-width"
                              value={size.value}
                              checked={formState.editorWidth === size.value}
                              onChange={(e) => setFormState((prev) => ({ ...prev, editorWidth: e.target.value }))}
                              className="mr-2"
                            />
                             <span className="text-sm text-text-secondary">{size.label}</span>
                          </label>
                        ))}
                      </div>
                     </div>
                  </div>

                  <div className="mt-8 flex">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleEditorSettingsSave}
                    >
                      {isLoading ? t('Saving...') : t('Save changes')}
                    </button>
                  </div>
                </form>
              </div>

              {/* Change Password (Billing section for now) */}
              <div id="billing" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
               <div>
                 <h2 className="text-base/7 font-semibold text-text">{t('Change password')}</h2>
                 <p className="mt-1 text-sm/6 text-text-tertiary">{t('Update your password associated with your account.')}</p>
               </div>

              <form className="md:col-span-2">
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl sm:grid-cols-6">
                   {/* Current Password */}
                   <div className="col-span-full">
                      <label htmlFor="current-password" className="block text-sm/6 font-medium text-text">
                        {t('Current password')}
                      </label>
                     <div className="mt-2">
                       <input
                         id="current-password"
                         name="current_password"
                         type="password"
                         autoComplete="current-password"
                         value={formState.currentPassword}
                         onChange={(e) => setFormState((prev) => ({ ...prev, currentPassword: e.target.value }))}
                          className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                        />
                      </div>
                    </div>

                    {/* New Password */}
                   <div className="col-span-full">
                      <label htmlFor="new-password" className="block text-sm/6 font-medium text-text">
                        {t('New password')}
                      </label>
                     <div className="mt-2">
                       <input
                         id="new-password"
                         name="new_password"
                         type="password"
                         autoComplete="new-password"
                         value={formState.newPassword}
                         onChange={(e) => setFormState((prev) => ({ ...prev, newPassword: e.target.value }))}
                          className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                        />
                      </div>
                    </div>

                    {/* Confirm Password */}
                   <div className="col-span-full">
                      <label htmlFor="confirm-password" className="block text-sm/6 font-medium text-text">
                        {t('Confirm password')}
                      </label>
                     <div className="mt-2">
                       <input
                         id="confirm-password"
                         name="confirm_password"
                         type="password"
                         autoComplete="new-password"
                         value={formState.confirmPassword}
                         onChange={(e) => setFormState((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                          className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handlePasswordChange}
                   >
                     {isLoading ? t('Updating...') : t('Change password')}
                   </button>
                 </div>
              </form>
            </div>

              {/* Data & Export */}
              <div id="data" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
               <div>
                 <h2 className="text-base/7 font-semibold text-text">{t('Data & Export')}</h2>
                 <p className="mt-1 text-sm/6 text-text-tertiary">{t('Import or export your notes in various formats.')}</p>
               </div>

              <div className="md:col-span-2">
                <div className="space-y-6">
                   {/* Import Section */}
                   <div>
                      <h3 className="text-sm/6 font-medium text-text mb-3">{t('Import Notes')}</h3>
                      <p className="text-sm text-text-tertiary mb-4">{t('Import a zip file containing markdown files.')}</p>
                     <button
                       type="button"
                       className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/5 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                       disabled
                       onClick={() => {
                         // TODO: Implement import functionality - handle zip file upload
                         console.log('Import clicked')
                       }}
                     >
                       {t('Import (Coming soon)')}
                     </button>
                   </div>

                   {/* Export Section */}
                   <div className="border-t border-white/10 pt-6">
                      <h3 className="text-sm/6 font-medium text-text mb-3">{t('Export Notes')}</h3>
                      <p className="text-sm text-text-tertiary mb-4">{t('Download all your notes as a zip file.')}</p>
                     <button
                       type="button"
                       className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/5 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                       disabled
                       onClick={() => {
                         // TODO: Implement export functionality - call /api/import-export endpoint
                         console.log('Export clicked')
                       }}
                     >
                       {t('Export (Coming soon)')}
                     </button>
                   </div>
                </div>
              </div>
            </div>

               {/* Canvas Integration */}
                <div id="canvas" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
                 <div>
                    <h2 className="text-base/7 font-semibold text-text">{t('Canvas Integration')}</h2>
                    <p className="mt-1 text-sm/6 text-text-tertiary">{t('Connect your Canvas LMS account to import your courses and lecture materials.')}</p>
                 </div>

                <div className="md:col-span-2 space-y-8">
                  <div>
                    <h3 className="text-sm/6 font-medium text-text mb-4">{t('Connect Canvas Account')}</h3>
                    <CanvasIntegration />
                  </div>
                  
                  <div className="border-t border-white/10 pt-8">
                    <h3 className="text-sm/6 font-medium text-text mb-4">{t('Import Status')}</h3>
                    <CanvasImportStatus />
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div id="danger" className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
               <div>
                 <h2 className="text-base/7 font-semibold text-text">{t('Danger Zone')}</h2>
                 <p className="mt-1 text-sm/6 text-text-tertiary">{t('Irreversible and destructive actions.')}</p>
               </div>

              <div className="md:col-span-2 space-y-6">
                  {/* Log out other sessions */}
                 <div>
                    <h3 className="text-sm/6 font-medium text-text mb-2">{t('Log out other sessions')}</h3>
                    <p className="text-sm text-text-tertiary mb-4">{t('Sign out all other active sessions on your account.')}</p>
                   <button
                     type="button"
                     disabled
                     className="rounded-md bg-yellow-500/10 px-3 py-2 text-sm font-semibold text-yellow-400 ring-1 ring-yellow-500/20 opacity-50 cursor-not-allowed"
                   >
                     {t('Log out other sessions (coming soon)')}
                   </button>
                 </div>

                  {/* Clear Vault */}
                  <div className="border-t border-white/10 pt-6">
                     <h3 className="text-sm/6 font-medium text-text mb-2">{t('Clear vault')}</h3>
                     <p className="text-sm text-text-tertiary mb-4">
                      {t('Permanently delete all notes, folders, and imported files. Your account and Canvas connection will remain intact.')}
                    </p>
                    {!clearVaultConfirm ? (
                      <button
                        type="button"
                        className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
                        onClick={() => setClearVaultConfirm(true)}
                      >
                        {t('Clear vault')}
                      </button>
                    ) : (
                      <div className="space-y-3">
                         <p className="text-xs text-text-tertiary">
                           {t('To confirm, type the following phrase exactly:')}
                        </p>
                         <p className="text-xs text-red-300 font-mono bg-red-500/10 rounded p-3 ring-1 ring-red-500/20 leading-relaxed select-none pointer-events-none">
                           {VAULT_CONFIRM_PHRASE}
                         </p>
                         <textarea
                           rows={4}
                           placeholder={t('Type the phrase above...')}
                           value={clearVaultInput}
                           onChange={e => setClearVaultInput(e.target.value)}
                           onPaste={(e) => e.preventDefault()}
                            className="block w-full rounded-md bg-white/5 px-3 py-2 text-sm text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-red-500 resize-none"
                         />
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            disabled={isClearingVault || (clearVaultInput !== VAULT_CONFIRM_PHRASE && clearVaultInput !== '0')}
                            className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            onClick={handleClearVault}
                          >
                            {isClearingVault ? t('Clearing...') : t('Confirm')}
                          </button>
                          <button
                            type="button"
                            disabled={isClearingVault}
                            className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
                            onClick={() => { setClearVaultConfirm(false); setClearVaultInput('') }}
                          >
                            {t('Cancel')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Delete Account */}
                  <div className="border-t border-white/10 pt-6">
                    <h3 className="text-sm/6 font-medium text-text mb-2">{t('Delete account')}</h3>
                    <p className="text-sm text-text-tertiary mb-4">
                     {t('Permanently delete your account and all associated data. This action cannot be undone.')}
                   </p>
                   <button
                     type="button"
                     className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400"
                     onClick={() => setDeleteAccountModal(true)}
                   >
                     {t('Delete my account')}
                   </button>
                 </div>
              </div>
            </div>
            </main>

      {/* Delete Account confirmation modal */}
      {deleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border-subtle shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-text">{t('Delete your account?')}</h2>
            <p className="text-sm text-text-tertiary">
              {t('Your account will be deactivated immediately and scheduled for permanent deletion after 30 days. To cancel, contact support within that window.')}
            </p>
            <p className="text-xs text-text-tertiary">
              {t('To confirm, type')} <span className="font-mono text-red-400">{DELETE_ACCOUNT_PHRASE}</span> {t('below:')}
            </p>
            <input
              type="text"
              autoFocus
              placeholder={DELETE_ACCOUNT_PHRASE}
              value={deleteAccountInput}
              onChange={(e) => setDeleteAccountInput(e.target.value)}
              className="block w-full rounded-md bg-white/5 px-3 py-2 text-sm text-text outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-red-500"
            />
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={isDeletingAccount || deleteAccountInput !== DELETE_ACCOUNT_PHRASE}
                className="rounded-md bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={handleDeleteAccount}
              >
                {isDeletingAccount ? t('Deleting...') : t('Delete my account')}
              </button>
              <button
                type="button"
                disabled={isDeletingAccount}
                className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
                onClick={() => { setDeleteAccountModal(false); setDeleteAccountInput('') }}
              >
                {t('Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
