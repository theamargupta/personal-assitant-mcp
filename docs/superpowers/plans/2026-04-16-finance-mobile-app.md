# Finance Mobile App (Android) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Android app (React Native + Expo) that reads UPI payment SMS, auto-detects transactions, shows a notification for categorization, syncs everything to the PA MCP backend, and supports manual entry.

**Architecture:** Expo managed workflow with Android-only SMS listener. Background service reads incoming SMS, parses UPI patterns (PhonePe, GPay, Paytm, bank debits), creates an uncategorized transaction via `POST /api/finance/transactions`, and fires a local notification. Tapping the notification opens a categorization screen. App authenticates via Supabase Auth and stores session securely.

**Tech Stack:** Expo SDK 53, React Native, TypeScript, Supabase Auth (`@supabase/supabase-js`), `expo-notifications`, `react-native-get-sms-android` (SMS reading), `expo-background-fetch` + `expo-task-manager` (background SMS), `expo-secure-store` (token storage)

**New Repo:** `devfrend-pa-mobile` (separate from `devfrend-personal-assitant`)

**Backend API Base URL:** `https://pa-mcp.devfrend.com` (or localhost during dev)

---

## File Structure

```
devfrend-pa-mobile/
├── app/                              # Expo Router file-based routing
│   ├── _layout.tsx                   # Root layout with auth guard
│   ├── (auth)/
│   │   ├── _layout.tsx               # Auth stack layout
│   │   ├── login.tsx                 # Login screen
│   │   └── signup.tsx                # Signup screen
│   ├── (tabs)/
│   │   ├── _layout.tsx               # Tab navigator layout
│   │   ├── index.tsx                 # Home/Dashboard
│   │   ├── transactions.tsx          # Transaction list
│   │   └── settings.tsx              # Settings + categories
│   ├── categorize/[id].tsx           # Categorize a transaction (opened from notification)
│   └── add.tsx                       # Manual entry screen
├── lib/
│   ├── api.ts                        # REST API client (fetch wrapper with auth)
│   ├── supabase.ts                   # Supabase client init
│   ├── auth.tsx                      # Auth context provider
│   ├── sms-parser.ts                 # UPI SMS regex parsing
│   └── sms-listener.ts              # Background SMS listener + notification
├── components/
│   ├── CategoryPicker.tsx            # Grid of category icons
│   ├── TransactionCard.tsx           # Single transaction display
│   └── SpendingSummary.tsx           # Weekly/monthly summary card
├── constants/
│   └── categories.ts                 # Default category icons/colors
├── app.json                          # Expo config
├── package.json
├── tsconfig.json
└── .env
```

---

## Task 1: Initialize Expo Project

- [ ] **Step 1: Create new Expo project**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project"
npx create-expo-app@latest devfrend-pa-mobile --template tabs
cd devfrend-pa-mobile
```

- [ ] **Step 2: Install core dependencies**

```bash
npx expo install expo-notifications expo-task-manager expo-background-fetch expo-secure-store
npm install @supabase/supabase-js react-native-get-sms-android
npm install -D @types/react-native-get-sms-android
```

- [ ] **Step 3: Configure app.json for Android**

Update `app.json` — set these fields:

```json
{
  "expo": {
    "name": "PA Finance",
    "slug": "pa-finance",
    "version": "1.0.0",
    "platforms": ["android"],
    "android": {
      "package": "com.devfrend.pafinance",
      "permissions": [
        "RECEIVE_SMS",
        "READ_SMS",
        "POST_NOTIFICATIONS"
      ],
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#3b82f6"
      }
    },
    "plugins": [
      "expo-notifications",
      "expo-secure-store",
      [
        "expo-task-manager",
        {
          "isEnabled": true
        }
      ]
    ]
  }
}
```

- [ ] **Step 4: Create .env file**

Create `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_BASE_URL=https://pa-mcp.devfrend.com
```

- [ ] **Step 5: Init git and commit**

```bash
git init
git add -A
git commit -m "init: Expo project with Android config, SMS and notification permissions"
```

---

## Task 2: Supabase Client + Auth Context

**Files:**
- Create: `lib/supabase.ts`
- Create: `lib/auth.tsx`

- [ ] **Step 1: Create Supabase client**

Create `lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

- [ ] **Step 2: Create auth context**

Create `lib/auth.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Session, User } from '@supabase/supabase-js'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase.ts lib/auth.tsx
git commit -m "feat(auth): add Supabase client with SecureStore and auth context"
```

---

## Task 3: API Client

**Files:**
- Create: `lib/api.ts`

- [ ] **Step 1: Create REST API client**

Create `lib/api.ts`:

```typescript
import { supabase } from './supabase'

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  if (response.status === 204) return undefined as T
  return response.json()
}

// ── Transactions ─────────────────────────────────

export interface TransactionInput {
  amount: number
  merchant?: string
  source_app?: string
  category_id?: string
  note?: string
  transaction_date?: string
  raw_sms?: string
  is_auto_detected?: boolean
}

export const api = {
  // Transactions
  createTransaction: (data: TransactionInput) =>
    request('/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listTransactions: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : ''
    return request(`/api/finance/transactions${query}`)
  },

  categorizeTransaction: (id: string, data: { category_id: string; note?: string }) =>
    request(`/api/finance/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTransaction: (id: string) =>
    request(`/api/finance/transactions/${id}`, { method: 'DELETE' }),

  // Categories
  listCategories: () =>
    request<{ categories: Array<{ id: string; name: string; icon: string; is_preset: boolean }> }>(
      '/api/finance/categories'
    ),

  createCategory: (name: string, icon: string) =>
    request('/api/finance/categories', {
      method: 'POST',
      body: JSON.stringify({ name, icon }),
    }),

  deleteCategory: (id: string) =>
    request(`/api/finance/categories/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/api.ts
git commit -m "feat(api): add REST client for finance endpoints"
```

---

## Task 4: SMS Parser

**Files:**
- Create: `lib/sms-parser.ts`

- [ ] **Step 1: Create SMS parser with UPI patterns**

Create `lib/sms-parser.ts`:

```typescript
export interface ParsedTransaction {
  amount: number
  merchant: string
  sourceApp: 'phonepe' | 'gpay' | 'paytm' | 'bank' | 'other'
  rawSms: string
}

interface SmsPattern {
  senderPattern: RegExp
  bodyPattern: RegExp
  sourceApp: ParsedTransaction['sourceApp']
}

const SMS_PATTERNS: SmsPattern[] = [
  // PhonePe
  {
    senderPattern: /PhonePe/i,
    bodyPattern: /(?:Paid|Sent)\s*₹?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:to|for)\s+(.+?)(?:\s+on|\s*\.|$)/i,
    sourceApp: 'phonepe',
  },
  // Google Pay
  {
    senderPattern: /GPay|Google\s*Pay/i,
    bodyPattern: /(?:Sent|Paid)\s*₹?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:to)\s+(.+?)(?:\s+on|\s*\.|$)/i,
    sourceApp: 'gpay',
  },
  // Paytm
  {
    senderPattern: /Paytm/i,
    bodyPattern: /₹?\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(?:paid|sent)\s*(?:to)\s+(.+?)(?:\s+on|\s*\.|$)/i,
    sourceApp: 'paytm',
  },
  // Bank debit SMS (generic)
  {
    senderPattern: /^[A-Z]{2}-[A-Z]+/,
    bodyPattern: /(?:debited|withdrawn).*?(?:Rs\.?|INR|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?).*?(?:to|at|for)\s+(.+?)(?:\s+on|\s+Ref|\s*\.|$)/i,
    sourceApp: 'bank',
  },
  // UPI generic
  {
    senderPattern: /UPI|NPCI/i,
    bodyPattern: /(?:Rs\.?|INR|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?).*?(?:to|paid|debited).*?([A-Za-z][\w\s]+?)(?:\s+on|\s+UPI|\s*\.|$)/i,
    sourceApp: 'other',
  },
]

export function parseSms(sender: string, body: string): ParsedTransaction | null {
  for (const pattern of SMS_PATTERNS) {
    if (!pattern.senderPattern.test(sender) && !pattern.senderPattern.test(body)) {
      continue
    }

    const match = body.match(pattern.bodyPattern)
    if (!match) continue

    const amountStr = match[1].replace(/,/g, '')
    const amount = parseFloat(amountStr)
    const merchant = match[2].trim()

    if (isNaN(amount) || amount <= 0) continue
    if (!merchant) continue

    return {
      amount,
      merchant,
      sourceApp: pattern.sourceApp,
      rawSms: body,
    }
  }

  return null
}

export function isPaymentSms(sender: string, body: string): boolean {
  const paymentKeywords = /(?:debited|paid|sent|withdrawn|payment|UPI)/i
  return paymentKeywords.test(body)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sms-parser.ts
git commit -m "feat(sms): add UPI payment SMS parser for PhonePe, GPay, Paytm, bank debits"
```

---

## Task 5: SMS Listener + Notification

**Files:**
- Create: `lib/sms-listener.ts`

- [ ] **Step 1: Create background SMS listener**

Create `lib/sms-listener.ts`:

```typescript
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import SmsAndroid from 'react-native-get-sms-android'
import { parseSms, isPaymentSms } from './sms-parser'
import { api } from './api'

const SMS_TASK_NAME = 'PA_SMS_LISTENER'

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false

  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function sendCategorizeNotification(
  transactionId: string,
  amount: number,
  merchant: string,
  sourceApp: string
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '💸 New Spend Detected',
      body: `₹${amount} to ${merchant} via ${sourceApp}`,
      data: { transactionId, screen: 'categorize' },
    },
    trigger: null, // immediate
  })
}

export async function processIncomingSms(sender: string, body: string) {
  if (!isPaymentSms(sender, body)) return

  const parsed = parseSms(sender, body)
  if (!parsed) return

  try {
    // Create uncategorized transaction on server
    const transaction = await api.createTransaction({
      amount: parsed.amount,
      merchant: parsed.merchant,
      source_app: parsed.sourceApp,
      raw_sms: parsed.rawSms,
      is_auto_detected: true,
    }) as { id: string }

    // Fire notification
    await sendCategorizeNotification(
      transaction.id,
      parsed.amount,
      parsed.merchant,
      parsed.sourceApp
    )
  } catch (error) {
    console.error('Failed to process SMS transaction:', error)
  }
}

// Poll for new SMS (since react-native-get-sms-android doesn't have a real-time listener,
// we check for recent SMS periodically via background fetch)
let lastCheckedTimestamp = Date.now()

export function startSmsPolling() {
  // Check every 30 seconds when app is foregrounded
  const interval = setInterval(() => {
    checkRecentSms()
  }, 30000)

  return () => clearInterval(interval)
}

function checkRecentSms() {
  const filter = {
    box: 'inbox',
    minDate: lastCheckedTimestamp,
    maxCount: 10,
  }

  SmsAndroid.list(
    JSON.stringify(filter),
    (fail: string) => console.error('SMS read failed:', fail),
    (_count: number, smsList: string) => {
      const messages = JSON.parse(smsList) as Array<{
        address: string
        body: string
        date: number
      }>

      for (const msg of messages) {
        if (msg.date > lastCheckedTimestamp) {
          processIncomingSms(msg.address, msg.body)
        }
      }

      if (messages.length > 0) {
        lastCheckedTimestamp = Math.max(...messages.map(m => m.date))
      }
    }
  )
}

// Register background task for when app is not in foreground
TaskManager.defineTask(SMS_TASK_NAME, async () => {
  try {
    checkRecentSms()
    return TaskManager.BackgroundFetchResult.NewData
  } catch {
    return TaskManager.BackgroundFetchResult.Failed
  }
})

export async function registerBackgroundSmsCheck() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(SMS_TASK_NAME)
  if (!isRegistered) {
    const BackgroundFetch = require('expo-background-fetch')
    await BackgroundFetch.registerTaskAsync(SMS_TASK_NAME, {
      minimumInterval: 60, // check every ~1 minute
      stopOnTerminate: false,
      startOnBoot: true,
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/sms-listener.ts
git commit -m "feat(sms): add background SMS polling, parsing, and notification trigger"
```

---

## Task 6: Category Picker Component

**Files:**
- Create: `constants/categories.ts`
- Create: `components/CategoryPicker.tsx`

- [ ] **Step 1: Create category constants**

Create `constants/categories.ts`:

```typescript
export const PRESET_ICONS: Record<string, string> = {
  Food: '🍕',
  Transport: '🚗',
  Shopping: '🛍️',
  Bills: '📄',
  Entertainment: '🎬',
  Health: '💊',
  Education: '📚',
  Groceries: '🛒',
  Subscriptions: '🔄',
  Other: '💰',
}
```

- [ ] **Step 2: Create CategoryPicker component**

Create `components/CategoryPicker.tsx`:

```typescript
import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Category {
  id: string
  name: string
  icon: string
  is_preset: boolean
}

interface Props {
  selected: string | null
  onSelect: (categoryId: string, categoryName: string) => void
}

export function CategoryPicker({ selected, onSelect }: Props) {
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    api.listCategories().then(res => setCategories(res.categories))
  }, [])

  return (
    <FlatList
      data={categories}
      numColumns={4}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.grid}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[styles.item, selected === item.id && styles.selected]}
          onPress={() => onSelect(item.id, item.name)}
        >
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.label} numberOfLines={1}>{item.name}</Text>
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  grid: { padding: 8 },
  item: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    margin: 4,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  selected: {
    backgroundColor: '#dbeafe',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  icon: { fontSize: 28 },
  label: { fontSize: 11, marginTop: 4, color: '#374151' },
})
```

- [ ] **Step 3: Commit**

```bash
git add constants/categories.ts components/CategoryPicker.tsx
git commit -m "feat(ui): add CategoryPicker grid component"
```

---

## Task 7: Categorize Screen (Notification Target)

**Files:**
- Create: `app/categorize/[id].tsx`

- [ ] **Step 1: Create categorize screen**

Create `app/categorize/[id].tsx`:

```typescript
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { CategoryPicker } from '@/components/CategoryPicker'
import { api } from '@/lib/api'

export default function CategorizeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!selectedCategory) {
      Alert.alert('Select a category')
      return
    }

    setSaving(true)
    try {
      await api.categorizeTransaction(id, {
        category_id: selectedCategory,
        note: note.trim() || undefined,
      })
      router.back()
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Categorize Spend</Text>

      <CategoryPicker
        selected={selectedCategory}
        onSelect={(id, name) => {
          setSelectedCategory(id)
          setCategoryName(name)
        }}
      />

      {selectedCategory && (
        <Text style={styles.selectedLabel}>Selected: {categoryName}</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Add a note (optional)... e.g. dinner with friends"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111827' },
  selectedLabel: { fontSize: 14, color: '#3b82f6', marginVertical: 8, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    marginVertical: 12,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
```

- [ ] **Step 2: Commit**

```bash
git add app/categorize/\[id\].tsx
git commit -m "feat(ui): add categorize screen opened from notification"
```

---

## Task 8: Manual Entry Screen

**Files:**
- Create: `app/add.tsx`

- [ ] **Step 1: Create manual entry screen**

Create `app/add.tsx`:

```typescript
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { CategoryPicker } from '@/components/CategoryPicker'
import { api } from '@/lib/api'

export default function AddTransactionScreen() {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Enter a valid amount')
      return
    }

    setSaving(true)
    try {
      await api.createTransaction({
        amount: numAmount,
        merchant: merchant.trim() || undefined,
        source_app: 'manual',
        category_id: selectedCategory || undefined,
        note: note.trim() || undefined,
        is_auto_detected: false,
      })
      router.back()
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Add Expense</Text>

      <Text style={styles.label}>Amount (₹)</Text>
      <TextInput
        style={styles.input}
        placeholder="500"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Where (merchant)</Text>
      <TextInput
        style={styles.input}
        placeholder="Zomato, Swiggy, Amazon..."
        value={merchant}
        onChangeText={setMerchant}
      />

      <Text style={styles.label}>Category</Text>
      <CategoryPicker
        selected={selectedCategory}
        onSelect={(id) => setSelectedCategory(id)}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, { minHeight: 60 }]}
        placeholder="dinner with friends"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveText}>{saving ? 'Saving...' : 'Add Expense'}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: '#111827' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  disabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
```

- [ ] **Step 2: Commit**

```bash
git add app/add.tsx
git commit -m "feat(ui): add manual expense entry screen"
```

---

## Task 9: Home Dashboard Screen

**Files:**
- Create: `components/TransactionCard.tsx`
- Create: `components/SpendingSummary.tsx`
- Create: `app/(tabs)/index.tsx`

- [ ] **Step 1: Create TransactionCard component**

Create `components/TransactionCard.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  amount: number
  merchant: string | null
  category: string
  icon: string
  date: string
  note: string | null
}

export function TransactionCard({ amount, merchant, category, icon, date, note }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.info}>
        <Text style={styles.merchant}>{merchant || 'Unknown'}</Text>
        <Text style={styles.meta}>{category} · {date}</Text>
        {note && <Text style={styles.note}>{note}</Text>}
      </View>
      <Text style={styles.amount}>₹{amount}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 1,
  },
  icon: { fontSize: 28, marginRight: 12 },
  info: { flex: 1 },
  merchant: { fontSize: 15, fontWeight: '600', color: '#111827' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' },
  amount: { fontSize: 16, fontWeight: '700', color: '#ef4444' },
})
```

- [ ] **Step 2: Create SpendingSummary component**

Create `components/SpendingSummary.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  totalSpent: number
  periodLabel: string
  topCategories: Array<{ name: string; icon: string; amount: number }>
}

export function SpendingSummary({ totalSpent, periodLabel, topCategories }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.period}>{periodLabel}</Text>
      <Text style={styles.total}>₹{totalSpent.toLocaleString('en-IN')}</Text>
      <View style={styles.categories}>
        {topCategories.slice(0, 4).map((cat, i) => (
          <View key={i} style={styles.catItem}>
            <Text style={styles.catIcon}>{cat.icon}</Text>
            <Text style={styles.catAmount}>₹{cat.amount}</Text>
            <Text style={styles.catName}>{cat.name}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    padding: 20,
    backgroundColor: '#1e293b',
    borderRadius: 16,
  },
  period: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  total: { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 4 },
  categories: { flexDirection: 'row', marginTop: 16, justifyContent: 'space-between' },
  catItem: { alignItems: 'center' },
  catIcon: { fontSize: 22 },
  catAmount: { fontSize: 13, fontWeight: '700', color: '#fff', marginTop: 4 },
  catName: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
})
```

- [ ] **Step 3: Create Home dashboard**

Create `app/(tabs)/index.tsx`:

```typescript
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { api } from '@/lib/api'
import { SpendingSummary } from '@/components/SpendingSummary'
import { TransactionCard } from '@/components/TransactionCard'

export default function HomeScreen() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<any[]>([])
  const [summary, setSummary] = useState<{ total: number; categories: any[] }>({ total: 0, categories: [] })

  const loadData = async () => {
    try {
      // Get this week's transactions
      const now = new Date()
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 7)

      const [txResult] = await Promise.all([
        api.listTransactions({
          start_date: weekAgo.toISOString(),
          limit: '20',
        }),
      ])

      const result = txResult as { transactions: any[]; total: number }
      setTransactions(result.transactions || [])

      // Calculate summary from transactions
      const total = result.transactions.reduce((sum: number, t: any) => sum + Number(t.amount), 0)
      const catMap = new Map<string, { name: string; icon: string; amount: number }>()
      for (const t of result.transactions) {
        const name = t.spending_categories?.name || 'Other'
        const icon = t.spending_categories?.icon || '💰'
        const existing = catMap.get(name) || { name, icon, amount: 0 }
        existing.amount += Number(t.amount)
        catMap.set(name, existing)
      }
      setSummary({
        total,
        categories: Array.from(catMap.values()).sort((a, b) => b.amount - a.amount),
      })
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  useFocusEffect(useCallback(() => { loadData() }, []))

  return (
    <View style={styles.container}>
      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        ListHeaderComponent={
          <>
            <SpendingSummary
              totalSpent={summary.total}
              periodLabel="This Week"
              topCategories={summary.categories}
            />
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent</Text>
              <TouchableOpacity onPress={() => router.push('/add')}>
                <Text style={styles.addButton}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <TransactionCard
            amount={Number(item.amount)}
            merchant={item.merchant}
            category={item.spending_categories?.name || 'Uncategorized'}
            icon={item.spending_categories?.icon || '❓'}
            date={new Date(item.transaction_date).toLocaleDateString('en-IN')}
            note={item.note}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No transactions yet. Spend something! 😄</Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  addButton: { fontSize: 15, fontWeight: '700', color: '#3b82f6' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 15 },
})
```

- [ ] **Step 4: Commit**

```bash
git add components/TransactionCard.tsx components/SpendingSummary.tsx app/\(tabs\)/index.tsx
git commit -m "feat(ui): add home dashboard with spending summary and recent transactions"
```

---

## Task 10: Root Layout + Notification Handler + SMS Init

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Update root layout**

Replace `app/_layout.tsx`:

```typescript
import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { AuthProvider, useAuth } from '@/lib/auth'
import { startSmsPolling, registerBackgroundSmsCheck, requestPermissions } from '@/lib/sms-listener'

function RootNavigator() {
  const { session, loading } = useAuth()
  const router = useRouter()

  // Handle notification taps — navigate to categorize screen
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data
      if (data?.screen === 'categorize' && data?.transactionId) {
        router.push(`/categorize/${data.transactionId}`)
      }
    })

    return () => subscription.remove()
  }, [router])

  // Start SMS polling when authenticated
  useEffect(() => {
    if (!session) return

    requestPermissions()
    registerBackgroundSmsCheck()
    const cleanup = startSmsPolling()

    return cleanup
  }, [session])

  if (loading) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {session ? (
        <>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="categorize/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Categorize' }} />
          <Stack.Screen name="add" options={{ presentation: 'modal', headerShown: true, title: 'Add Expense' }} />
        </>
      ) : (
        <Stack.Screen name="(auth)" />
      )}
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat(app): wire up auth guard, notification handler, and SMS listener in root layout"
```

---

## Task 11: Login + Signup Screens

**Files:**
- Create: `app/(auth)/_layout.tsx`
- Create: `app/(auth)/login.tsx`
- Create: `app/(auth)/signup.tsx`

- [ ] **Step 1: Create auth layout**

Create `app/(auth)/_layout.tsx`:

```typescript
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  )
}
```

- [ ] **Step 2: Create login screen**

Create `app/(auth)/login.tsx`:

```typescript
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'

export default function LoginScreen() {
  const { signIn } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Fill in all fields')
      return
    }
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PA Finance</Text>
      <Text style={styles.subtitle}>Track your spending</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Log In'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
        <Text style={styles.link}>Don't have an account? Sign Up</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    padding: 14, fontSize: 15, marginBottom: 12,
  },
  button: {
    backgroundColor: '#3b82f6', padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { color: '#3b82f6', textAlign: 'center', marginTop: 16, fontSize: 14 },
})
```

- [ ] **Step 3: Create signup screen**

Create `app/(auth)/signup.tsx`:

```typescript
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useAuth } from '@/lib/auth'

export default function SignupScreen() {
  const { signUp } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Fill in all fields')
      return
    }
    if (password.length < 6) {
      Alert.alert('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await signUp(email, password)
      Alert.alert('Check your email', 'We sent a confirmation link')
    } catch (error) {
      Alert.alert('Signup Failed', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Sign Up'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>Already have an account? Log In</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12,
    padding: 14, fontSize: 15, marginBottom: 12,
  },
  button: {
    backgroundColor: '#3b82f6', padding: 16, borderRadius: 12,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { color: '#3b82f6', textAlign: 'center', marginTop: 16, fontSize: 14 },
})
```

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/_layout.tsx app/\(auth\)/login.tsx app/\(auth\)/signup.tsx
git commit -m "feat(auth): add login and signup screens"
```

---

## Task 12: Build + Test on Android

- [ ] **Step 1: Start Expo dev server**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-pa-mobile"
npx expo start
```

- [ ] **Step 2: Run on Android emulator or device**

```bash
npx expo run:android
```

Or scan QR code with Expo Go on your Android phone.

- [ ] **Step 3: Test the flow**

1. Sign up / log in
2. Grant SMS and notification permissions when prompted
3. Go to "Add" — manually create a transaction
4. Verify it appears on home dashboard
5. Send yourself a test SMS matching PhonePe format: `Paid ₹500 to Zomato via UPI`
6. Verify notification appears
7. Tap notification → categorize screen opens
8. Pick category + note → save
9. Verify home dashboard updates

- [ ] **Step 4: Fix any issues, then commit**

```bash
git add -A
git commit -m "fix: resolve build and runtime issues"
```

---

## Summary

### Backend (existing repo) — 10 tasks
| What | Details |
|------|---------|
| DB | `spending_categories` + `transactions` tables, RLS, preset seed, summary RPC |
| REST API | 7 endpoints under `/api/finance/*` |
| MCP Tools | `get_spending_summary`, `list_transactions`, `add_transaction`, `get_uncategorized` |
| Auth | Supabase Auth bearer token verification for mobile |

### Mobile App (new repo) — 12 tasks
| What | Details |
|------|---------|
| Framework | Expo SDK 53 + React Native, Android only |
| Auth | Supabase Auth with SecureStore |
| SMS | Background polling, UPI regex parser (PhonePe, GPay, Paytm, bank) |
| Notifications | Local notification on spend detection, tap → categorize |
| Screens | Login, Signup, Home Dashboard, Transaction List, Manual Entry, Categorize |
| Components | CategoryPicker, TransactionCard, SpendingSummary |
