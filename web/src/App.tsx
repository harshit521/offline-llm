import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import Workspace from '@/pages/Workspace'
import Conversations from '@/pages/Conversations'
import Documents from '@/pages/Documents'
import Models from '@/pages/Models'
import System from '@/pages/System'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/models" element={<Models />} />
          <Route path="/system" element={<System />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
